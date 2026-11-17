import { BusinessPersistenceError, type BusinessUpdater } from "@/src/application/ports/business-store";
import { defaultCompanyProfile, defaultOwnerUser, seedBusinessState, type BusinessState } from "@/src/domain/business-state";
import { DIRECT_COST_CATEGORIES, USER_ROLES } from "@/src/domain/settings";
import { isBusinessDate, retainDocumentSequences } from "@/src/domain/business-integrity";

export const BUSINESS_STORAGE_KEY = "sultan-seafood-business-v3";
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
type StoreSnapshot = { state: BusinessState; storageError: string | null };

const fields = {
  batches: ["batchNumber", "startDate", "notes"],
  commissions: ["batchId", "date", "partner", "note"],
  sourcings: ["batchId", "date", "sourceType", "sourceName", "productName", "unit", "note"],
  lapakSales: ["batchId", "date", "customerLabel", "paymentStatus"],
  lapakExpenses: ["batchId", "date", "expenseName", "notes"],
  products: ["sku", "name", "category", "size", "unit", "status"],
  suppliers: ["name", "contactName", "phone", "email", "address", "status"],
  restaurants: ["name", "contactName", "phone", "email", "address", "notes", "status"],
  receipts: ["receiptNumber", "supplierId", "date", "supplierReference", "dueDate", "notes", "status"],
  supplierPayments: ["receiptId", "date", "method", "reference"],
  stockMovements: ["date", "productId", "type", "reference", "notes"],
  customerPrices: ["restaurantId", "productId", "date"],
  invoices: ["invoiceNumber", "salesChannel", "customerName", "date", "dueDate", "status"],
  payments: ["invoiceId", "date", "method", "reference"],
  operatingExpenses: ["date", "category", "description"],
  notes: ["title", "content", "createdAt"],
  users: ["name", "email", "role", "status", "createdAt"],
  auditLogs: ["createdAt", "userName", "action", "entityName", "reference"],
} as const;
const companyFields = ["name", "address", "phone", "email", "website", "npwp", "bankName", "bankAccount", "bankHolder"] as const;
const amounts = {
  batches: [], commissions: ["amount"],
  sourcings: ["quantity", "unitCost", "totalCost", "paidAmount", "outstandingAmount"],
  lapakSales: ["totalAmount"], lapakExpenses: ["amount"],
  products: ["defaultSellingPrice", "averageHpp", "latestPurchaseCost", "stockBalance", "minimumStock"],
  suppliers: [], restaurants: ["paymentTermDays"],
  receipts: ["subtotal"],
  supplierPayments: ["amount"],
  stockMovements: ["quantity", "balanceAfter", "unitCost"],
  customerPrices: ["sellingPrice"],
  invoices: ["subtotal", "discount", "total", "paidAmount", "outstandingAmount"],
  payments: ["amount"], operatingExpenses: ["amount"], notes: [],
  users: [], auditLogs: [],
} as const;
// Dates that may legitimately be empty (e.g. no receipt due date).
const optionalDates = new Set(["receipts.dueDate"]);
// Movements store signed quantities and balances can be reconciled to zero.
const signedAmounts = new Set(["stockMovements.quantity"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Fills fields introduced after v3 so data saved by older builds stays readable.
// Entries (and lists) that are already current keep their identity, so unchanged data is never rewritten.
function migrateLegacyState(value: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = { ...value };
  const migrate = (key: string, convert: (entry: Record<string, unknown>) => Record<string, unknown> | null) => {
    const entries = value[key];
    if (entries === undefined) { migrated[key] = []; return; }
    if (!Array.isArray(entries)) return;
    let changed = false;
    const next = entries.map((entry) => {
      if (!isRecord(entry)) return entry;
      const converted = convert(entry);
      if (!converted) return entry;
      changed = true;
      return converted;
    });
    if (changed) migrated[key] = next;
  };
  const missing = (entry: Record<string, unknown>, defaults: Record<string, unknown>) => {
    const gaps = Object.entries(defaults).filter(([field]) => entry[field] === undefined);
    return gaps.length ? { ...entry, ...Object.fromEntries(gaps) } : null;
  };
  migrate("products", (entry) => missing(entry, { size: "", latestPurchaseCost: typeof entry.averageHpp === "number" ? entry.averageHpp : 0 }));
  migrate("suppliers", (entry) => missing(entry, { email: "", address: "" }));
  migrate("restaurants", (entry) => missing(entry, { email: "", address: "", notes: "" }));
  migrate("receipts", (entry) => {
    if (Array.isArray(entry.items)) return missing(entry, { supplierReference: "", dueDate: "", notes: "" });
    const { productId, manualWeight, digitalWeight, unitPurchasePrice, ...rest } = entry;
    const items = typeof productId === "string" ? [{ productId, manualQuantity: manualWeight, digitalQuantity: digitalWeight, unitCost: unitPurchasePrice }] : entry.items;
    return { ...rest, items, supplierReference: entry.supplierReference ?? "", dueDate: entry.dueDate ?? "", notes: entry.notes ?? "" };
  });
  migrate("supplierPayments", () => null);
  migrate("stockMovements", () => null);
  migrate("customerPrices", () => null);
  migrate("auditLogs", () => null);
  if (value.users === undefined) migrated.users = [defaultOwnerUser()];
  if (value.company === undefined) migrated.company = defaultCompanyProfile();
  else if (isRecord(value.company)) {
    const gaps = Object.entries(defaultCompanyProfile()).filter(([field]) => (value.company as Record<string, unknown>)[field] === undefined);
    if (gaps.length) migrated.company = { ...value.company, ...Object.fromEntries(gaps) };
  }
  return migrated;
}

const record = isRecord;

export function normalizeBusinessState(input: unknown): BusinessState {
  if (!record(input)) throw new Error("Format data tidak valid");
  const value = migrateLegacyState(input);
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    const entries = value[key];
    if (!Array.isArray(entries)) throw new Error(`Data ${key} tidak valid`);
    const ids = new Set<string>();
    for (const entry of entries) {
      if (!record(entry) || typeof entry.id !== "string" || !entry.id || ids.has(entry.id)) throw new Error(`Identitas ${key} tidak valid`);
      ids.add(entry.id);
      for (const field of fields[key]) {
        if (typeof entry[field] !== "string") throw new Error(`Kolom ${key}.${field} tidak valid`);
        const emptyAllowed = optionalDates.has(`${key}.${field}`) && entry[field] === "";
        if (["date", "startDate", "dueDate"].includes(field) && !emptyAllowed && !isBusinessDate(entry[field] as string)) throw new Error(`Tanggal ${key} tidak valid`);
      }
      for (const field of amounts[key]) {
        if (typeof entry[field] !== "number" || !Number.isFinite(entry[field]) || (!signedAmounts.has(`${key}.${field}`) && (entry[field] as number) < 0)) throw new Error(`Angka ${key}.${field} tidak valid`);
      }
      if (key === "restaurants" && (!Number.isSafeInteger(entry.paymentTermDays) || (entry.paymentTermDays as number) > 3650)) throw new Error("Termin restoran tidak valid");
      if ((key === "invoices" || key === "payments") && entry.revision !== undefined && (!Number.isSafeInteger(entry.revision) || (entry.revision as number) < 0)) throw new Error("Revisi transaksi tidak valid");
      if (key === "receipts" && entry.paidAmount !== undefined && (typeof entry.paidAmount !== "number" || !Number.isFinite(entry.paidAmount) || entry.paidAmount < 0 || entry.paidAmount > (entry.subtotal as number))) throw new Error("Pembayaran supplier tidak valid");
      if (key === "receipts") {
        if (!["POSTED", "CANCELLED"].includes(entry.status as string)) throw new Error("Status penerimaan tidak valid");
        if (!Array.isArray(entry.items) || entry.items.length === 0) throw new Error("Item penerimaan tidak valid");
        for (const item of entry.items) {
          if (!record(item) || typeof item.productId !== "string" || ["manualQuantity", "digitalQuantity", "unitCost"].some((field) => typeof item[field] !== "number" || !Number.isFinite(item[field]) || (item[field] as number) < 0)) throw new Error("Detail item penerimaan tidak valid");
        }
      }
      if (key === "users") {
        if (!USER_ROLES.includes(entry.role as never) || !["ACTIVE", "INACTIVE"].includes(entry.status as string)) throw new Error("Pengguna tidak valid");
      }
      if (key === "invoices" && entry.directCosts !== undefined) {
        if (!Array.isArray(entry.directCosts)) throw new Error("Biaya internal invoice tidak valid");
        for (const cost of entry.directCosts) {
          if (!record(cost) || typeof cost.id !== "string" || typeof cost.name !== "string" || !DIRECT_COST_CATEGORIES.includes(cost.category as never) || typeof cost.amount !== "number" || !Number.isFinite(cost.amount) || cost.amount < 0) throw new Error("Biaya internal invoice tidak valid");
        }
      }
      if (key === "lapakSales" || key === "invoices") {
        if (!Array.isArray(entry.items)) throw new Error("Item transaksi tidak valid");
        const strings = key === "invoices" ? ["productId"] : ["productName", "unit"];
        const numbers = key === "invoices" ? ["stockQuantity", "marginQuantity", "billingQuantity", "sellingPrice", "hpp", "subtotal", "hppTotal", "profit"] : ["quantity", "sellingPrice", "unitCost", "subtotal", "costTotal", "profit"];
        for (const item of entry.items) {
          if (!record(item) || strings.some((field) => typeof item[field] !== "string") || numbers.some((field) => typeof item[field] !== "number" || !Number.isFinite(item[field]) || (field !== "profit" && (item[field] as number) < 0))) throw new Error("Detail item transaksi tidak valid");
          if (key === "invoices" && ["productName", "unit"].some((field) => item[field] !== undefined && typeof item[field] !== "string")) throw new Error("Informasi produk invoice tidak valid");
        }
      }
    }
  }
  if (!record(value.company) || companyFields.some((field) => typeof (value.company as Record<string, unknown>)[field] !== "string")) throw new Error("Profil bisnis tidak valid");
  if (value.numberSequences !== undefined && (!record(value.numberSequences) || Object.values(value.numberSequences).some((number) => !Number.isSafeInteger(number) || (number as number) < 0))) throw new Error("Urutan nomor tidak valid");
  const state = value as unknown as BusinessState;
  return retainDocumentSequences({
    ...state,
    // Remove only obsolete batch lifecycle properties; preserve all business data.
    batches: state.batches.map((batch) => ({ id: batch.id, batchNumber: batch.batchNumber, startDate: batch.startDate, notes: batch.notes })),
  });
}

export function createLocalBusinessStore(accessStorage: () => StorageAccess) {
  const serverSnapshot: StoreSnapshot = { state: seedBusinessState(), storageError: null };
  let snapshot = serverSnapshot;
  let loaded = false;
  let readable = false;
  let lastRaw: string | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: StoreSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  function reload(notify = true) {
    loaded = true;
    let next: StoreSnapshot;
    try {
      const raw = accessStorage().getItem(BUSINESS_STORAGE_KEY);
      const state = raw === null ? seedBusinessState() : normalizeBusinessState(JSON.parse(raw));
      lastRaw = raw;
      readable = true;
      next = { state, storageError: null };
    } catch {
      readable = false;
      next = { state: snapshot.state, storageError: "Data lokal tidak dapat dibaca atau formatnya rusak. Penyimpanan diblokir agar data lama tidak tertimpa. Angka di layar belum terverifikasi; jangan hapus data browser." };
    }
    if (notify) publish(next);
    else snapshot = next;
  }
  const getSnapshot = () => {
    if (!loaded) reload(false);
    return snapshot;
  };
  return {
    getSnapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    reload: () => reload(),
    update: (updater: BusinessUpdater) => {
      getSnapshot();
      if (!readable) throw new BusinessPersistenceError(snapshot.storageError!);
      let candidate: BusinessState;
      try {
        const storage = accessStorage();
        if (storage.getItem(BUSINESS_STORAGE_KEY) !== lastRaw) {
          reload();
          throw new BusinessPersistenceError("Data berubah di tab lain. Belum ada perubahan yang disimpan; periksa data terbaru lalu coba lagi.");
        }
        candidate = normalizeBusinessState(updater(snapshot.state));
        const serialized = JSON.stringify(candidate);
        // Commit to disk first; a failed write never changes the business snapshot.
        storage.setItem(BUSINESS_STORAGE_KEY, serialized);
        lastRaw = serialized;
      } catch (error) {
        const message = error instanceof BusinessPersistenceError ? error.message : "Gagal menyimpan data lokal. Perubahan belum disimpan; input tetap tersedia. Periksa izin atau kapasitas penyimpanan browser, lalu coba lagi.";
        publish({ ...snapshot, storageError: message });
        throw new BusinessPersistenceError(message);
      }
      publish({ state: candidate, storageError: null });
    },
  };
}
