"use client";

import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  Download,
  Edit2,
  Filter,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { Module } from "@/src/domain/dashboard";
import {
  formatRupiah,
  today,
  type BusinessState,
} from "@/src/domain/business-state";
import type { BusinessCommands } from "@/src/application/use-cases/business-commands";
import { receiptOutstanding } from "@/src/domain/business-integrity";
import { resolveWorkspacePage } from "@/src/presentation/dashboard/workspace-routing";
import InvoiceWorkspace from "@/src/presentation/dashboard/InvoiceWorkspace";
import { RestoReportsPage } from "@/src/presentation/dashboard/RestoReports";
import { RestoSettingsPage } from "@/src/presentation/dashboard/RestoSettings";
import {
  ExpensesPage,
  PayablesPage,
  RestaurantsPage,
  StockPage,
  SuppliersPage,
} from "@/src/presentation/dashboard/RestoPages";

type Notify = (message: string, tone?: "success" | "error" | "info") => void;

const subscribeToNothing = () => () => {};
const portalReadyOnClient = () => true;
const portalReadyOnServer = () => false;

type WorkspacePageProps = {
  module: Module;
  page: string;
  business: BusinessState;
  commands: BusinessCommands;
  onNotify: Notify;
  onNavigate?: (
    module: Module,
    page: string,
    openForm?: boolean,
    invoiceId?: string,
  ) => void;
  initialFormOpen?: boolean;
  initialCreateBatch?: boolean;
  initialInvoiceId?: string;
  initialBatchId?: string;
};

type FormValue = Record<string, string>;
type EditRecord = { page: string; id: string };

const money = (amount: number) => `Rp ${formatRupiah(amount)}`;
const asNumber = (value: string) => Number(value) || 0;
const asMoney = (value: string) =>
  Number(value.replace(/\./g, "").replace(",", ".")) || 0;
const moneyFields = new Set([
  "amount",
  "unitCost",
  "paidAmount",
  "sellingPrice",
  "unitPurchasePrice",
  "discount",
]);

const pageMeta: Record<
  string,
  { title: string; description: string; action: string }
> = {
  Aktivitas: {
    title: "Aktivitas bisnis",
    description: "Semua catatan transaksi terbaru dari workspace bisnis kamu.",
    action: "Catat aktivitas",
  },
  Laporan: {
    title: "Laporan global",
    description:
      "Ringkasan gabungan Lapak dan Resto & Online berdasarkan periode.",
    action: "Export laporan",
  },
  Batches: {
    title: "Batch Lapak",
    description: "Kelola batch dan seluruh transaksi yang terkait dengannya.",
    action: "Buat batch",
  },
  Commission: {
    title: "Komisi Lapak",
    description: "Catat pendapatan komisi dari supplier atau pedagang.",
    action: "Tambah komisi",
  },
  "Sourcing & Bengkelan": {
    title: "Pengadaan & Bengkelan",
    description:
      "Catat barang dari supplier atau bengkelan untuk kebutuhan batch Lapak.",
    action: "Tambah pengadaan",
  },
  "B2C Sales": {
    title: "Penjualan Lapak",
    description: "Catat penjualan langsung dengan cost basis per baris.",
    action: "Tambah penjualan",
  },
  Expenses: {
    title: "Pengeluaran Lapak",
    description: "Kelola biaya operasional yang terkait dengan batch Lapak.",
    action: "Tambah pengeluaran",
  },
  "Operating Expenses": {
    title: "Pengeluaran Resto & Online",
    description:
      "Catat biaya operasional Resto & Online tanpa mencampur data Lapak.",
    action: "Tambah pengeluaran",
  },
  "Laporan Lapak": {
    title: "Laporan Lapak",
    description:
      "Analisis komisi, pengadaan, penjualan, biaya, dan profit Lapak.",
    action: "Export laporan",
  },
  "Stock, Price & Cost": {
    title: "Stok & produk",
    description:
      "Kelola produk, penerimaan stok, HPP rata-rata, dan harga jual.",
    action: "Terima stok",
  },
  Invoices: {
    title: "Invoice",
    description:
      "Buat invoice restoran atau order online dengan kalkulasi HPP dan stock.",
    action: "Buat invoice/order",
  },
  Payments: {
    title: "Pembayaran & piutang",
    description: "Catat pembayaran dan pantau outstanding customer.",
    action: "Catat pembayaran",
  },
  Payables: {
    title: "Utang supplier",
    description: "Pantau tagihan dari penerimaan stok Resto & Online.",
    action: "Catat penerimaan stok",
  },
  Restaurants: {
    title: "Restoran",
    description: "Kelola customer restoran dan termin pembayaran.",
    action: "Tambah restoran",
  },
  Suppliers: {
    title: "Supplier",
    description: "Kelola supplier dan histori penerimaan stok.",
    action: "Tambah supplier",
  },
  Reports: {
    title: "Laporan Resto & Online",
    description: "Analisis invoice, profit, piutang, utang supplier, dan stok.",
    action: "Export laporan",
  },
  "Pengaturan Resto": {
    title: "Pengaturan",
    description: "Profil bisnis, pengguna, dan audit log.",
    action: "Simpan",
  },
  "Laporan Resto": {
    title: "Laporan Resto & Online",
    description: "Analisis invoice, profit, piutang, utang supplier, dan stok.",
    action: "Export laporan",
  },
  Notes: {
    title: "Private Notes",
    description:
      "Catatan internal yang hanya tersimpan di workspace lokal ini.",
    action: "Tambah catatan",
  },
  Settings: {
    title: "Settings",
    description:
      "Pengaturan lokal untuk demo browser dan preferensi workspace.",
    action: "Simpan pengaturan",
  },
};

function fieldLabel(key: string) {
  if (key === "paidAmount") return "Sudah dibayar";
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (value) => value.toUpperCase());
}

function Field({
  name,
  value,
  onChange,
  type = "text",
  options,
  placeholder,
  required = false,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  options?: { label: string; value: string }[];
  placeholder?: string;
  required?: boolean;
}) {
  const isMoney = moneyFields.has(name);
  return (
    <label className="form-field">
      <span>
        {fieldLabel(name)}
        {isMoney ? " (Rp)" : ""}
        {required ? " *" : ""}
      </span>
      {options ? (
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Pilih {fieldLabel(name).toLowerCase()}</option>
          {options.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          required={required}
          type={isMoney ? "text" : type}
          step={type === "number" ? "any" : undefined}
          inputMode={isMoney ? "numeric" : undefined}
          value={isMoney ? formatRupiah(value) : value}
          onChange={(event) =>
            onChange(
              isMoney ? formatRupiah(event.target.value) : event.target.value,
            )
          }
          placeholder={placeholder}
        />
      )}
    </label>
  );
}

function ModalForm({
  page,
  state,
  commands,
  onClose,
  onNotify,
  initialBatchId,
  editRecord,
}: {
  page: string;
  state: BusinessState;
  commands: BusinessCommands;
  onClose: () => void;
  onNotify: Notify;
  initialBatchId?: string;
  editRecord?: EditRecord;
}) {
  const isMultiItem = [
    "Expenses",
    "Commission",
    "B2C Sales",
    "Sourcing & Bengkelan",
  ].includes(page);
  const createItem = (): FormValue => ({
    date: today(),
    batchId: initialBatchId ?? "",
    sourceType: "BENGKELAN",
    unit: "kg",
    quantity: "1",
    marginQuantity: "0",
    discount: "0",
  });
  const [form, setForm] = useState<FormValue>({
    date: today(),
    startDate: today(),
    batchId: initialBatchId ?? "",
    unit: "kg",
    digitalWeight: "0",
    manualWeight: "0",
    quantity: "1",
    marginQuantity: "0",
    discount: "0",
    paymentTermDays: "14",
  });
  const existingItem =
    editRecord?.page === "Commission"
      ? state.commissions.find((item) => item.id === editRecord.id)
      : editRecord?.page === "Expenses"
        ? state.lapakExpenses.find((item) => item.id === editRecord.id)
        : editRecord?.page === "Sourcing & Bengkelan"
          ? state.sourcings.find((item) => item.id === editRecord.id)
          : editRecord?.page === "B2C Sales"
            ? state.lapakSales.find((item) => item.id === editRecord.id)
            : undefined;
  const initialItem =
    existingItem && editRecord?.page === "B2C Sales" && "items" in existingItem
      ? {
          ...createItem(),
          batchId: existingItem.batchId,
          date: existingItem.date,
          productName: existingItem.items[0]?.productName ?? "",
          quantity: String(existingItem.items[0]?.quantity ?? "1"),
          unit: existingItem.items[0]?.unit ?? "kg",
          sellingPrice: String(existingItem.items[0]?.sellingPrice ?? ""),
          unitCost: String(existingItem.items[0]?.unitCost ?? ""),
        }
      : existingItem
        ? {
            ...createItem(),
            ...Object.fromEntries(
              Object.entries(existingItem).map(([key, value]) => [
                key,
                String(value ?? ""),
              ]),
            ),
          }
        : createItem();
  const [items, setItems] = useState<FormValue[]>([initialItem]);
  const portalReady = useSyncExternalStore(
    subscribeToNothing,
    portalReadyOnClient,
    portalReadyOnServer,
  );
  const set = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setItem = (index: number, key: string, value: string) =>
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  const batches = state.batches;
  const products = state.products.filter(
    (product) => product.status === "ACTIVE",
  );
  const suppliers = state.suppliers.filter(
    (supplier) => supplier.status === "ACTIVE",
  );

  const validateItem = (item: FormValue) => {
    const batch = batches.find((candidate) => candidate.id === item.batchId);
    if (!batch) return "Pilih batch Lapak yang tersedia";
    if (
      page === "Commission" &&
      (!item.partner?.trim() || asMoney(item.amount || "") <= 0)
    )
      return "Partner dan jumlah komisi wajib diisi";
    if (
      page === "Expenses" &&
      (!item.expenseName?.trim() || asMoney(item.amount || "") <= 0)
    )
      return "Nama dan jumlah pengeluaran wajib diisi";
    if (
      page === "B2C Sales" &&
      (!item.productName?.trim() ||
        asNumber(item.quantity || "0") <= 0 ||
        asMoney(item.sellingPrice || "") <= 0 ||
        asMoney(item.unitCost || "") < 0)
    )
      return "Produk, quantity, dan harga penjualan wajib valid";
    if (
      page === "Sourcing & Bengkelan" &&
      (!item.sourceName?.trim() ||
        !item.productName?.trim() ||
        asNumber(item.quantity || "0") <= 0 ||
        asMoney(item.unitCost || "") <= 0 ||
        asMoney(item.paidAmount || "") < 0)
    )
      return "Sumber, produk, quantity, dan biaya pengadaan wajib valid";
    return null;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isMultiItem) {
      const invalidIndex = items.findIndex((item) => validateItem(item));
      if (invalidIndex >= 0) {
        onNotify(
          `Item ${invalidIndex + 1}: ${validateItem(items[invalidIndex])}`,
          "error",
        );
        return;
      }
      const saved = commands.runTransaction((commands) => {
        for (const [index, item] of items.entries()) {
          let result = { ok: false, message: "Item belum didukung" };
          if (page === "Commission") {
            const input = {
              batchId: item.batchId,
              date: item.date || today(),
              partner: item.partner || "",
              amount: asMoney(item.amount || ""),
              note: item.note || "",
            };
            result = editRecord
              ? commands.updateCommission(editRecord.id, input)
              : commands.addCommission(input);
          }
          if (page === "Sourcing & Bengkelan") {
            const input = {
              batchId: item.batchId,
              date: item.date || today(),
              sourceType: (item.sourceType || "BENGKELAN") as
                | "SUPPLIER"
                | "BENGKELAN",
              sourceName: item.sourceName || "",
              productName: item.productName || "",
              quantity: asNumber(item.quantity || "0"),
              unit: item.unit || "kg",
              unitCost: asMoney(item.unitCost || ""),
              paidAmount: asMoney(item.paidAmount || ""),
              note: item.note || "",
            };
            result = editRecord
              ? commands.updateSourcing(editRecord.id, input)
              : commands.addSourcing(input);
          }
          if (page === "B2C Sales") {
            const input = {
              batchId: item.batchId,
              date: item.date || today(),
              productName: item.productName || "",
              quantity: asNumber(item.quantity || "0"),
              unit: item.unit || "kg",
              sellingPrice: asMoney(item.sellingPrice || ""),
              unitCost: asMoney(item.unitCost || ""),
            };
            result = editRecord
              ? commands.updateLapakSale(editRecord.id, input)
              : commands.addLapakSale(input);
          }
          if (page === "Expenses") {
            const input = {
              batchId: item.batchId,
              date: item.date || today(),
              expenseName: item.expenseName || "",
              amount: asMoney(item.amount || ""),
              notes: item.notes || "",
            };
            result = editRecord
              ? commands.updateLapakExpense(editRecord.id, input)
              : commands.addLapakExpense(input);
          }
          if (!result.ok) {
            return {
              ok: false,
              message: `Item ${index + 1}: ${result.message}`,
            };
          }
        }
        return {
          ok: true,
          message: editRecord
            ? "Data berhasil diperbarui"
            : `${items.length} item berhasil disimpan`,
        };
      });
      onNotify(saved.message, saved.ok ? "success" : "error");
      if (saved.ok) onClose();
      return;
    }
    let result = { ok: false, message: "Form belum didukung" };
    if (page === "Batches")
      result = commands.createBatch({
        startDate: form.startDate || today(),
        notes: form.notes || "",
      });
    if (page === "Produk")
      result = commands.addProduct({
        sku: form.sku || "",
        name: form.name || "",
        category: form.category || "",
        unit: form.unit || "kg",
        sellingPrice: asMoney(form.sellingPrice || ""),
        minimumStock: asNumber(form.minimumStock || "0"),
      });
    if (page === "Suppliers")
      result = commands.addSupplier({
        name: form.name || "",
        contactName: form.contactName || "",
        phone: form.phone || "",
      });
    if (page === "Restaurants")
      result = commands.addRestaurant({
        name: form.name || "",
        contactName: form.contactName || "",
        phone: form.phone || "",
        paymentTermDays: asNumber(form.paymentTermDays || "0"),
      });
    if (page === "Stock, Price & Cost")
      result = commands.receiveStock({
        supplierId: form.supplierId || "",
        date: form.date || today(),
        productId: form.productId || "",
        manualWeight: asNumber(form.manualWeight || "0"),
        digitalWeight: asNumber(form.digitalWeight || "0"),
        unitPurchasePrice: asMoney(form.unitPurchasePrice || ""),
        paidAmount: asMoney(form.paidAmount || ""),
      });
    if (page === "Operating Expenses")
      result = commands.addOperatingExpense({
        date: form.date || today(),
        category: form.category || "",
        description: form.description || "",
        amount: asMoney(form.amount || ""),
      });
    if (page === "Notes")
      result = commands.addNote({
        title: form.title || "",
        content: form.content || "",
      });
    onNotify(result.message, result.ok ? "success" : "error");
    if (result.ok) onClose();
  };

  const renderItemFields = (item: FormValue, index: number) => (
    <div className="form-item-card" key={`item-${index}`}>
      <div className="form-item-heading">
        <strong>Item {index + 1}</strong>
        {items.length > 1 && (
          <button
            className="text-link"
            type="button"
            onClick={() =>
              setItems((current) =>
                current.filter((_, itemIndex) => itemIndex !== index),
              )
            }
          >
            Hapus
          </button>
        )}
      </div>
      <div className="form-grid">
        <Field
          name="batchId"
          options={batches.map((batch) => ({
            label: batch.batchNumber,
            value: batch.id,
          }))}
          value={item.batchId || ""}
          onChange={(value) => setItem(index, "batchId", value)}
        />
        <Field
          name="date"
          type="date"
          value={item.date || ""}
          onChange={(value) => setItem(index, "date", value)}
        />
        {page === "Commission" && (
          <>
            <Field
              name="partner"
              value={item.partner || ""}
              onChange={(value) => setItem(index, "partner", value)}
              placeholder="Nama supplier atau pedagang"
            />
            <Field
              name="amount"
              type="number"
              value={item.amount || ""}
              onChange={(value) => setItem(index, "amount", value)}
              placeholder="0"
            />
          </>
        )}
        {page === "Expenses" && (
          <>
            <Field
              name="expenseName"
              value={item.expenseName || ""}
              onChange={(value) => setItem(index, "expenseName", value)}
              placeholder="Es, plastik, transportasi..."
            />
            <Field
              name="amount"
              type="number"
              value={item.amount || ""}
              onChange={(value) => setItem(index, "amount", value)}
              placeholder="0"
            />
            <Field
              name="notes"
              value={item.notes || ""}
              onChange={(value) => setItem(index, "notes", value)}
              placeholder="Catatan"
            />
          </>
        )}
        {page === "B2C Sales" && (
          <>
            <Field
              name="productName"
              value={item.productName || ""}
              onChange={(value) => setItem(index, "productName", value)}
              placeholder="Nama produk"
            />
            <Field
              name="quantity"
              type="number"
              value={item.quantity || ""}
              onChange={(value) => setItem(index, "quantity", value)}
            />
            <Field
              name="sellingPrice"
              type="number"
              value={item.sellingPrice || ""}
              onChange={(value) => setItem(index, "sellingPrice", value)}
            />
            <Field
              name="unitCost"
              type="number"
              value={item.unitCost || ""}
              onChange={(value) => setItem(index, "unitCost", value)}
            />
          </>
        )}
        {page === "Sourcing & Bengkelan" && (
          <>
            <Field
              name="sourceType"
              options={[
                { label: "Bengkelan", value: "BENGKELAN" },
                { label: "Supplier", value: "SUPPLIER" },
              ]}
              value={item.sourceType || "BENGKELAN"}
              onChange={(value) => setItem(index, "sourceType", value)}
            />
            <Field
              name="sourceName"
              value={item.sourceName || ""}
              onChange={(value) => setItem(index, "sourceName", value)}
              placeholder="Nama sumber"
            />
            <Field
              name="productName"
              value={item.productName || ""}
              onChange={(value) => setItem(index, "productName", value)}
              placeholder="Nama seafood"
            />
            <Field
              name="quantity"
              type="number"
              value={item.quantity || ""}
              onChange={(value) => setItem(index, "quantity", value)}
            />
            <Field
              name="unitCost"
              type="number"
              value={item.unitCost || ""}
              onChange={(value) => setItem(index, "unitCost", value)}
            />
            <Field
              name="paidAmount"
              type="number"
              value={item.paidAmount || ""}
              onChange={(value) => setItem(index, "paidAmount", value)}
            />
          </>
        )}
      </div>
    </div>
  );

  const renderSingleFields = () => {
    if (page === "Batches")
      return (
        <>
          <Field
            name="startDate"
            type="date"
            value={form.startDate || ""}
            onChange={(value) => set("startDate", value)}
          />
          <Field
            name="notes"
            value={form.notes || ""}
            onChange={(value) => set("notes", value)}
            placeholder="Catatan batch"
          />
        </>
      );
    if (page === "Produk")
      return (
        <>
          <Field
            name="sku"
            value={form.sku || ""}
            onChange={(value) => set("sku", value)}
            placeholder="UDG-001"
          />
          <Field
            name="name"
            value={form.name || ""}
            onChange={(value) => set("name", value)}
            placeholder="Nama produk"
          />
          <Field
            name="category"
            value={form.category || ""}
            onChange={(value) => set("category", value)}
            placeholder="Udang, Cumi..."
          />
          <Field
            name="unit"
            value={form.unit || "kg"}
            onChange={(value) => set("unit", value)}
          />
          <Field
            name="sellingPrice"
            type="number"
            value={form.sellingPrice || ""}
            onChange={(value) => set("sellingPrice", value)}
          />
          <Field
            name="minimumStock"
            type="number"
            value={form.minimumStock || ""}
            onChange={(value) => set("minimumStock", value)}
          />
        </>
      );
    if (page === "Suppliers")
      return (
        <>
          <Field
            name="name"
            value={form.name || ""}
            onChange={(value) => set("name", value)}
            placeholder="Nama supplier"
          />
          <Field
            name="contactName"
            value={form.contactName || ""}
            onChange={(value) => set("contactName", value)}
            placeholder="Nama kontak"
          />
          <Field
            name="phone"
            value={form.phone || ""}
            onChange={(value) => set("phone", value)}
            placeholder="08..."
          />
        </>
      );
    if (page === "Restaurants")
      return (
        <>
          <Field
            name="name"
            value={form.name || ""}
            onChange={(value) => set("name", value)}
            placeholder="Nama restoran"
          />
          <Field
            name="contactName"
            value={form.contactName || ""}
            onChange={(value) => set("contactName", value)}
            placeholder="Nama kontak"
          />
          <Field
            name="phone"
            value={form.phone || ""}
            onChange={(value) => set("phone", value)}
            placeholder="08..."
          />
          <Field
            name="paymentTermDays"
            type="number"
            value={form.paymentTermDays || "14"}
            onChange={(value) => set("paymentTermDays", value)}
          />
        </>
      );
    if (page === "Stock, Price & Cost")
      return (
        <>
          <Field
            name="supplierId"
            options={suppliers.map((supplier) => ({
              label: supplier.name,
              value: supplier.id,
            }))}
            value={form.supplierId || ""}
            onChange={(value) => set("supplierId", value)}
          />
          <Field
            name="productId"
            options={products.map((product) => ({
              label: `${product.name} · stok ${product.stockBalance} ${product.unit}`,
              value: product.id,
            }))}
            value={form.productId || ""}
            onChange={(value) => set("productId", value)}
          />
          <Field
            name="date"
            type="date"
            value={form.date || ""}
            onChange={(value) => set("date", value)}
          />
          <Field
            name="manualWeight"
            type="number"
            value={form.manualWeight || ""}
            onChange={(value) => set("manualWeight", value)}
          />
          <Field
            name="digitalWeight"
            type="number"
            value={form.digitalWeight || ""}
            onChange={(value) => set("digitalWeight", value)}
          />
          <Field
            name="unitPurchasePrice"
            type="number"
            value={form.unitPurchasePrice || ""}
            onChange={(value) => set("unitPurchasePrice", value)}
          />
          <Field
            name="paidAmount"
            value={form.paidAmount ?? ""}
            onChange={(value) => set("paidAmount", value)}
            required
            placeholder="Isi 0 jika belum dibayar"
          />
          <p className="modal-copy">
            Total penerimaan{" "}
            {money(
              asNumber(form.digitalWeight || "0") *
                asMoney(form.unitPurchasePrice || ""),
            )}
            . Isi jumlah yang benar-benar sudah dibayar; sisa tagihan otomatis
            menjadi utang supplier.
          </p>
        </>
      );
    if (page === "Operating Expenses")
      return (
        <>
          <Field
            name="date"
            type="date"
            value={form.date || ""}
            onChange={(value) => set("date", value)}
          />
          <Field
            name="category"
            value={form.category || ""}
            onChange={(value) => set("category", value)}
            placeholder="Logistik, listrik..."
          />
          <Field
            name="description"
            value={form.description || ""}
            onChange={(value) => set("description", value)}
            placeholder="Deskripsi"
          />
          <Field
            name="amount"
            type="number"
            value={form.amount || ""}
            onChange={(value) => set("amount", value)}
          />
        </>
      );
    if (page === "Notes")
      return (
        <>
          <Field
            name="title"
            value={form.title || ""}
            onChange={(value) => set("title", value)}
            placeholder="Judul catatan"
          />
          <label className="form-field">
            <span>Content</span>
            <textarea
              value={form.content || ""}
              onChange={(event) => set("content", event.target.value)}
              placeholder="Tulis catatan internal..."
              rows={5}
            />
          </label>
        </>
      );
    return (
      <>
        <Field
          name="date"
          type="date"
          value={form.date || ""}
          onChange={(value) => set("date", value)}
        />
        <Field
          name="category"
          value={form.category || ""}
          onChange={(value) => set("category", value)}
          placeholder="Kategori"
        />
        <Field
          name="amount"
          type="number"
          value={form.amount || ""}
          onChange={(value) => set("amount", value)}
        />
      </>
    );
  };

  const modal = (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="form-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">
              {editRecord
                ? "Edit data"
                : isMultiItem
                  ? `${items.length} item transaksi`
                  : "Local workspace"}
            </p>
            <h2>
              {editRecord
                ? `Edit ${pageMeta[page]?.title ?? "data"}`
                : (pageMeta[page]?.action ?? "Tambah data")}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Tutup"
            type="button"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="modal-copy">
          {editRecord
            ? "Perbaiki data yang tersimpan lalu simpan perubahan."
            : isMultiItem
              ? "Tambahkan beberapa item sekaligus, lalu simpan dalam satu proses."
              : "Data tersimpan di browser ini."}
        </p>
        <form onSubmit={submit}>
          {isMultiItem ? (
            <>
              <div className="multi-item-list">
                {items.map(renderItemFields)}
              </div>
              {!editRecord && (
                <button
                  className="secondary-outline-button add-item-button"
                  type="button"
                  onClick={() =>
                    setItems((current) => [...current, createItem()])
                  }
                >
                  <Plus size={16} /> Tambah item
                </button>
              )}
            </>
          ) : (
            <div className="form-grid">{renderSingleFields()}</div>
          )}
          <div className="modal-actions">
            <button
              className="secondary-outline-button"
              type="button"
              onClick={onClose}
            >
              Batal
            </button>
            <button className="primary-button" type="submit">
              <Plus size={16} />{" "}
              {editRecord
                ? "Simpan perubahan"
                : isMultiItem
                  ? `Simpan ${items.length} item`
                  : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
  return portalReady ? createPortal(modal, document.body) : modal;
}

function getRows(page: string, state: BusinessState) {
  if (page === "Batches")
    return {
      columns: ["Nomor batch", "Tanggal mulai", "Catatan", "Aksi"],
      rows: state.batches.map((batch) => [
        batch.batchNumber,
        batch.startDate,
        batch.notes,
        batch.id,
      ]),
    };
  if (page === "Commission")
    return {
      columns: ["Tanggal", "Supplier / Pedagang", "Batch", "Jumlah", "Catatan"],
      rows: state.commissions.map((item) => [
        item.date,
        item.partner,
        state.batches.find((batch) => batch.id === item.batchId)?.batchNumber ??
          "-",
        money(item.amount),
        item.note || "-",
      ]),
    };
  if (page === "Sourcing & Bengkelan")
    return {
      columns: ["Tanggal", "Batch", "Sumber", "Produk", "Total", "Outstanding"],
      rows: state.sourcings.map((item) => [
        item.date,
        state.batches.find((batch) => batch.id === item.batchId)?.batchNumber ??
          "-",
        item.sourceName,
        item.productName,
        money(item.totalCost),
        money(item.outstandingAmount),
      ]),
    };
  if (page === "B2C Sales")
    return {
      columns: ["Tanggal", "Batch", "Produk", "Revenue", "Profit"],
      rows: state.lapakSales.flatMap((sale) =>
        sale.items.map((item) => [
          sale.date,
          state.batches.find((batch) => batch.id === sale.batchId)
            ?.batchNumber ?? "-",
          item.productName,
          money(item.subtotal),
          money(item.profit),
        ]),
      ),
    };
  if (page === "Expenses")
    return {
      columns: ["Tanggal", "Kategori", "Batch", "Jumlah", "Catatan"],
      rows: state.lapakExpenses.map((item) => [
        item.date,
        item.expenseName,
        state.batches.find((batch) => batch.id === item.batchId)?.batchNumber ??
          "-",
        money(item.amount),
        item.notes || "-",
      ]),
    };
  if (page === "Produk")
    return {
      columns: [
        "SKU",
        "Nama produk",
        "Kategori",
        "Stok",
        "HPP rata-rata",
        "Harga jual",
      ],
      rows: state.products.map((item) => [
        item.sku,
        item.name,
        item.category,
        `${item.stockBalance} ${item.unit}`,
        money(item.averageHpp),
        money(item.defaultSellingPrice),
      ]),
    };
  if (page === "Suppliers")
    return {
      columns: ["Nama supplier", "Kontak", "Telepon", "Status"],
      rows: state.suppliers.map((item) => [
        item.name,
        item.contactName,
        item.phone,
        item.status,
      ]),
    };
  if (page === "Restaurants")
    return {
      columns: ["Nama restoran", "Kontak", "Telepon", "Term", "Status"],
      rows: state.restaurants.map((item) => [
        item.name,
        item.contactName,
        item.phone,
        `${item.paymentTermDays} hari`,
        item.status,
      ]),
    };
  if (page === "Stock, Price & Cost")
    return {
      columns: ["Produk", "Stok", "Minimum", "HPP", "Status"],
      rows: state.products.map((item) => [
        item.name,
        `${item.stockBalance} ${item.unit}`,
        `${item.minimumStock} ${item.unit}`,
        money(item.averageHpp),
        item.stockBalance <= item.minimumStock ? "Menipis" : "Aman",
      ]),
    };
  if (page === "Invoices")
    return {
      columns: ["Nomor", "Channel", "Customer", "Tanggal", "Total", "Status"],
      rows: state.invoices.map((item) => [
        item.invoiceNumber,
        item.salesChannel,
        item.customerName,
        item.date,
        money(item.total),
        item.status,
      ]),
    };
  if (page === "Payments")
    return {
      columns: ["Tanggal", "Invoice", "Metode", "Referensi", "Jumlah"],
      rows: state.payments.map((item) => [
        item.date,
        state.invoices.find((invoice) => invoice.id === item.invoiceId)
          ?.invoiceNumber ?? "-",
        item.method,
        item.reference || "-",
        money(item.amount),
      ]),
    };
  if (page === "Operating Expenses")
    return {
      columns: ["Tanggal", "Kategori", "Deskripsi", "Jumlah"],
      rows: state.operatingExpenses.map((item) => [
        item.date,
        item.category,
        item.description,
        money(item.amount),
      ]),
    };
  if (page === "Notes")
    return {
      columns: ["Judul", "Isi", "Dibuat"],
      rows: state.notes.map((item) => [
        item.title,
        item.content,
        item.createdAt.slice(0, 10),
      ]),
    };
  if (page === "Payables")
    return {
      columns: [
        "Supplier",
        "Penerimaan",
        "Tanggal",
        "Total",
        "Dibayar",
        "Sisa utang",
        "Status",
      ],
      rows: state.receipts.map((item) => {
        const outstanding = receiptOutstanding(item);
        return [
          state.suppliers.find((supplier) => supplier.id === item.supplierId)
            ?.name ?? "Supplier tidak ditemukan",
          item.receiptNumber,
          item.date,
          money(item.subtotal),
          item.paidAmount === undefined
            ? "Belum diketahui"
            : money(item.paidAmount),
          outstanding === null ? "Belum diketahui" : money(outstanding),
          outstanding === null
            ? "Perlu verifikasi"
            : outstanding === 0
              ? "Lunas"
              : "Belum lunas",
        ];
      }),
    };
  if (
    page === "Reports" ||
    page === "Laporan" ||
    page === "Laporan Lapak" ||
    page === "Laporan Resto"
  )
    return {
      columns: ["Nama laporan", "Periode", "Ringkasan", "Status"],
      rows: [
        ["Sales & revenue", "Bulan ini", "Export CSV tersedia", "Siap"],
        ["Profit & cost", "Bulan ini", "Per module", "Siap"],
        ["Receivables / payables", "Bulan ini", "Outstanding tracking", "Siap"],
      ],
    };
  return {
    columns: ["Item", "Detail", "Status"],
    rows: [
      ["Workspace lokal", "Browser storage aktif", "Aktif"],
      ["Data source", "LocalStorage", "Demo"],
    ],
  };
}

function BatchCreateWorkspace({
  commands,
  onNotify,
  onCreated,
  onUpdated,
  onCreateAndAdd,
  onCancel,
  initialBatch,
}: {
  commands: BusinessCommands;
  onNotify: Notify;
  onCreated?: (batchId: string) => void;
  onUpdated?: () => void;
  onCreateAndAdd?: (
    page: string,
    input: { startDate: string; notes: string },
  ) => void;
  onCancel: () => void;
  initialBatch?: BusinessState["batches"][number];
}) {
  const [form, setForm] = useState<FormValue>({
    startDate: initialBatch?.startDate ?? today(),
    notes: initialBatch?.notes ?? "",
  });
  const input = {
    startDate: form.startDate || today(),
    notes: form.notes || "",
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = initialBatch
      ? commands.updateBatch(initialBatch.id, input)
      : commands.createBatch(input);
    onNotify(result.message, result.ok ? "success" : "error");
    if (!result.ok) return;
    if (initialBatch) onUpdated?.();
    else if (result.id) onCreated?.(result.id);
  };
  const transactionActions = [
    ["Expenses", "Catat pengeluaran"],
    ["Commission", "Catat komisi"],
    ["B2C Sales", "Catat penjualan"],
    ["Sourcing & Bengkelan", "Catat pengadaan"],
  ];
  return (
    <div className="workspace-page batch-create-workspace">
      <button className="back-link" type="button" onClick={onCancel}>
        ← Kembali ke daftar batch
      </button>
      <div className="workspace-page-head batch-create-head">
        <div>
          <p className="eyebrow">
            Lapak / {initialBatch ? "Edit batch" : "Batch baru"}
          </p>
          <h1>{initialBatch ? initialBatch.batchNumber : "Batch baru"}</h1>
          <p>
            {initialBatch
              ? "Perbaiki informasi batch yang sudah tersimpan."
              : "Isi data batch, lalu langsung catat seluruh transaksi dari workspace ini."}
          </p>
        </div>
        {!initialBatch && (
          <div className="batch-detail-actions">
            {transactionActions.map(([page, label]) => (
              <button
                className="secondary-outline-button"
                type="button"
                key={page}
                onClick={() => onCreateAndAdd?.(page, input)}
              >
                <Plus size={15} /> {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <section className="panel batch-create-info">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Informasi batch</p>
            <h2>Data utama</h2>
          </div>
        </div>
        <form id="batch-create-form" onSubmit={submit}>
          <div className="form-grid">
            <Field
              name="startDate"
              type="date"
              value={form.startDate}
              onChange={(value) =>
                setForm((current) => ({ ...current, startDate: value }))
              }
            />
            <Field
              name="notes"
              value={form.notes}
              onChange={(value) =>
                setForm((current) => ({ ...current, notes: value }))
              }
              placeholder="Contoh: Pasar Muara Baru, shift pagi"
            />
          </div>
        </form>
      </section>
      {!initialBatch && (
        <div className="batch-create-transactions">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Transaksi batch</p>
                <h2>Pengeluaran</h2>
              </div>
              <span className="resource-count">0 transaksi</span>
            </div>
            <div className="empty-state">
              Belum ada pengeluaran. Gunakan tombol “Catat pengeluaran” di
              header.
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Transaksi batch</p>
                <h2>Komisi</h2>
              </div>
              <span className="resource-count">0 transaksi</span>
            </div>
            <div className="empty-state">
              Belum ada komisi. Gunakan tombol “Catat komisi” di header.
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Transaksi batch</p>
                <h2>Penjualan B2C</h2>
              </div>
              <span className="resource-count">0 transaksi</span>
            </div>
            <div className="empty-state">
              Belum ada penjualan. Gunakan tombol “Catat penjualan” di header.
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Transaksi batch</p>
                <h2>Pengadaan &amp; Bengkelan</h2>
              </div>
              <span className="resource-count">0 transaksi</span>
            </div>
            <div className="empty-state">
              Belum ada pengadaan. Gunakan tombol “Catat pengadaan” di header.
            </div>
          </section>
        </div>
      )}
      <div className="modal-actions batch-create-actions">
        <button
          className="secondary-outline-button"
          type="button"
          onClick={onCancel}
        >
          Batal
        </button>
        <button
          className="primary-button"
          type="submit"
          form="batch-create-form"
        >
          <Plus size={16} />{" "}
          {initialBatch ? "Simpan perubahan" : "Simpan batch & buka workspace"}
        </button>
      </div>
    </div>
  );
}

function BatchListPage({
  state,
  onCreate,
  onOpen,
  onEdit,
  onDelete,
}: {
  state: BusinessState;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="workspace-page">
      <div className="workspace-page-head">
        <div>
          <p className="eyebrow">Lapak / Batch</p>
          <h1>Batch Lapak</h1>
          <p>Lihat pendapatan dan biaya untuk setiap batch.</p>
        </div>
        <button className="primary-button" type="button" onClick={onCreate}>
          <Plus size={16} /> Buat batch
        </button>
      </div>
      <section className="panel resource-panel">
        <div className="panel-heading">
          <div>
            <h2>Daftar batch</h2>
          </div>
          <span className="resource-count">{state.batches.length} batch</span>
        </div>
        {state.batches.length > 0 ? (
          <div className="table-wrap batch-table-wrap">
            <table className="batch-list-table" aria-label="Daftar batch Lapak">
              <thead>
                <tr>
                  <th scope="col">Batch</th>
                  <th scope="col">Pendapatan</th>
                  <th scope="col">Biaya</th>
                  <th scope="col" className="batch-actions-heading">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.batches.map((batch) => {
                  const commissionRevenue = state.commissions
                    .filter((item) => item.batchId === batch.id)
                    .reduce((sum, item) => sum + item.amount, 0);
                  const salesRevenue = state.lapakSales
                    .filter((item) => item.batchId === batch.id)
                    .reduce((sum, item) => sum + item.totalAmount, 0);
                  const sourcingCost = state.sourcings
                    .filter((item) => item.batchId === batch.id)
                    .reduce((sum, item) => sum + item.totalCost, 0);
                  const expenseCost = state.lapakExpenses
                    .filter((item) => item.batchId === batch.id)
                    .reduce((sum, item) => sum + item.amount, 0);
                  const note = batch.notes.trim();
                  const batchName = note
                    ? /^batch\b/i.test(note)
                      ? note
                      : `Batch ${note}`
                    : "Batch tanpa nama";

                  return (
                    <tr
                      className="batch-table-row"
                      key={batch.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`Buka detail ${batch.batchNumber}`}
                      onClick={() => onOpen(batch.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpen(batch.id);
                        }
                      }}
                    >
                      <td className="batch-table-identity">
                        <strong>{batch.batchNumber}</strong>
                        <small>
                          {batchName} · {batch.startDate}
                        </small>
                      </td>
                      <td className="batch-table-amount">
                        {money(commissionRevenue + salesRevenue)}
                      </td>
                      <td className="batch-table-amount">
                        {money(sourcingCost + expenseCost)}
                      </td>
                      <td>
                        <div
                          className="batch-table-actions"
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <button
                            className="text-link"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpen(batch.id);
                            }}
                          >
                            Lihat detail
                          </button>
                          <button
                            className="icon-button"
                            type="button"
                            aria-label={`Edit ${batch.batchNumber}`}
                            title={`Edit ${batch.batchNumber}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onEdit(batch.id);
                            }}
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            className="icon-button danger-button"
                            type="button"
                            aria-label={`Hapus ${batch.batchNumber}`}
                            title={`Hapus ${batch.batchNumber}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onDelete(batch.id);
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">Belum ada batch.</div>
        )}
      </section>
    </div>
  );
}

function BatchDetail({
  batchId,
  state,
  onBack,
  onAdd,
  onEdit,
  onDelete,
}: {
  batchId: string;
  state: BusinessState;
  onBack: () => void;
  onAdd: (page: string) => void;
  onEdit: (page: string, id: string) => void;
  onDelete: (page: string, id: string) => void;
}) {
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch)
    return (
      <div className="empty-state">
        Batch tidak ditemukan.{" "}
        <button className="text-link" type="button" onClick={onBack}>
          Kembali ke daftar batch
        </button>
      </div>
    );
  const commissions = state.commissions.filter(
    (item) => item.batchId === batch.id,
  );
  const sourcings = state.sourcings.filter((item) => item.batchId === batch.id);
  const sales = state.lapakSales.filter((item) => item.batchId === batch.id);
  const expenses = state.lapakExpenses.filter(
    (item) => item.batchId === batch.id,
  );
  const commissionTotal = commissions.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const sourcingTotal = sourcings.reduce(
    (sum, item) => sum + item.totalCost,
    0,
  );
  const salesTotal = sales.reduce((sum, item) => sum + item.totalAmount, 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + item.amount, 0);
  const actions = [
    ["Expenses", "Tambah pengeluaran"],
    ["Commission", "Tambah komisi"],
    ["Sourcing & Bengkelan", "Tambah pengadaan"],
    ["B2C Sales", "Tambah penjualan"],
  ];
  return (
    <div className="batch-detail">
      <button className="back-link" type="button" onClick={onBack}>
        ← Semua batch
      </button>
      <div className="batch-detail-head">
        <div>
          <p className="eyebrow">Lapak / Batch</p>
          <h1>{batch.batchNumber}</h1>
          <p>{batch.startDate} · Batch</p>
          <strong className="batch-detail-note">
            {batch.notes || "Tanpa catatan"}
          </strong>
        </div>
        <div className="batch-detail-actions">
          {actions.map(([page, label]) => (
            <button
              className="secondary-outline-button"
              type="button"
              key={page}
              onClick={() => onAdd(page)}
            >
              <Plus size={15} /> {label}
            </button>
          ))}
          <button
            className="primary-button batch-export-button"
            type="button"
            onClick={() => window.print()}
          >
            <Download size={15} /> Export PDF
          </button>
        </div>
      </div>
      <div className="resource-stats batch-summary-stats">
        <div className="resource-stat">
          <span>Komisi</span>
          <strong>{money(commissionTotal)}</strong>
          <small>{commissions.length} catatan</small>
        </div>
        <div className="resource-stat">
          <span>Penjualan B2C</span>
          <strong>{money(salesTotal)}</strong>
          <small>{sales.length} transaksi</small>
        </div>
        <div className="resource-stat">
          <span>Total biaya</span>
          <strong>{money(sourcingTotal + expenseTotal)}</strong>
          <small>{sourcings.length + expenses.length} catatan</small>
        </div>
      </div>
      <div className="batch-detail-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Transaksi batch</p>
              <h2>Pengeluaran</h2>
            </div>
            <span className="resource-count">{expenses.length} data</span>
          </div>
          {expenses.length ? (
            <div className="batch-item-list">
              {expenses.map((item) => (
                <div className="batch-item" key={item.id}>
                  <div>
                    <strong>{item.expenseName}</strong>
                    <small>
                      {item.date} · {item.notes || "Tanpa catatan"}
                    </small>
                  </div>
                  <b>{money(item.amount)}</b>
                  <div className="item-actions">
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Edit pengeluaran"
                      onClick={() => onEdit("Expenses", item.id)}
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      className="icon-button danger-button"
                      type="button"
                      aria-label="Hapus pengeluaran"
                      onClick={() => onDelete("Expenses", item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              Belum ada pengeluaran untuk batch ini.
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Transaksi batch</p>
              <h2>Komisi</h2>
            </div>
            <span className="resource-count">{commissions.length} data</span>
          </div>
          {commissions.length ? (
            <div className="batch-item-list">
              {commissions.map((item) => (
                <div className="batch-item" key={item.id}>
                  <div>
                    <strong>{item.partner}</strong>
                    <small>
                      {item.date} · {item.note || "Tanpa catatan"}
                    </small>
                  </div>
                  <b>{money(item.amount)}</b>
                  <div className="item-actions">
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Edit komisi"
                      onClick={() => onEdit("Commission", item.id)}
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      className="icon-button danger-button"
                      type="button"
                      aria-label="Hapus komisi"
                      onClick={() => onDelete("Commission", item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">Belum ada komisi untuk batch ini.</div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Transaksi batch</p>
              <h2>Pengadaan &amp; Bengkelan</h2>
            </div>
            <span className="resource-count">{sourcings.length} data</span>
          </div>
          {sourcings.length ? (
            <div className="batch-item-list">
              {sourcings.map((item) => (
                <div className="batch-item" key={item.id}>
                  <div>
                    <strong>{item.productName}</strong>
                    <small>
                      {item.date} · {item.sourceName} · {item.quantity}{" "}
                      {item.unit}
                    </small>
                  </div>
                  <b>{money(item.totalCost)}</b>
                  <div className="item-actions">
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Edit pengadaan"
                      onClick={() => onEdit("Sourcing & Bengkelan", item.id)}
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      className="icon-button danger-button"
                      type="button"
                      aria-label="Hapus pengadaan"
                      onClick={() => onDelete("Sourcing & Bengkelan", item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              Belum ada pengadaan untuk batch ini.
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Transaksi batch</p>
              <h2>Penjualan B2C</h2>
            </div>
            <span className="resource-count">{sales.length} data</span>
          </div>
          {sales.length ? (
            <div className="batch-item-list">
              {sales.map((sale) => (
                <div className="batch-item" key={sale.id}>
                  <div>
                    <strong>
                      {sale.items.map((item) => item.productName).join(", ")}
                    </strong>
                    <small>
                      {sale.date} · Profit{" "}
                      {money(
                        sale.items.reduce((sum, item) => sum + item.profit, 0),
                      )}
                    </small>
                  </div>
                  <b>{money(sale.totalAmount)}</b>
                  <div className="item-actions">
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Edit penjualan"
                      onClick={() => onEdit("B2C Sales", sale.id)}
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      className="icon-button danger-button"
                      type="button"
                      aria-label="Hapus penjualan"
                      onClick={() => onDelete("B2C Sales", sale.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              Belum ada penjualan untuk batch ini.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function LapakSummaryCards({
  page,
  state,
}: {
  page: string;
  state: BusinessState;
}) {
  const cards =
    page === "B2C Sales"
      ? (() => {
          const sales = state.lapakSales;
          const revenue = sales.reduce(
            (sum, item) => sum + item.totalAmount,
            0,
          );
          const profit = sales.reduce(
            (sum, item) =>
              sum +
              item.items.reduce((itemSum, line) => itemSum + line.profit, 0),
            0,
          );
          const units = sales.reduce(
            (sum, item) =>
              sum +
              item.items.reduce((itemSum, line) => itemSum + line.quantity, 0),
            0,
          );
          return [
            {
              label: "Total penjualan",
              value: money(revenue),
              detail: `${sales.length} transaksi tercatat`,
            },
            {
              label: "Total profit",
              value: money(profit),
              detail: "setelah perhitungan HPP",
            },
            {
              label: "Unit terjual",
              value: units.toLocaleString("id-ID"),
              detail: "total quantity semua produk",
            },
          ];
        })()
      : page === "Commission"
        ? (() => {
            const commissions = state.commissions;
            const total = commissions.reduce(
              (sum, item) => sum + item.amount,
              0,
            );
            const partners = new Set(
              commissions.map((item) => item.partner.trim()).filter(Boolean),
            ).size;
            return [
              {
                label: "Total komisi",
                value: money(total),
                detail: `${commissions.length} catatan tercatat`,
              },
              {
                label: "Partner penerima",
                value: partners.toLocaleString("id-ID"),
                detail: "partner unik pada data komisi",
              },
              {
                label: "Rata-rata komisi",
                value: money(
                  commissions.length ? total / commissions.length : 0,
                ),
                detail: "nilai rata-rata per catatan",
              },
            ];
          })()
        : page === "Expenses"
          ? (() => {
              const expenses = state.lapakExpenses;
              const total = expenses.reduce(
                (sum, item) => sum + item.amount,
                0,
              );
              const batches = new Set(expenses.map((item) => item.batchId))
                .size;
              return [
                {
                  label: "Total pengeluaran",
                  value: money(total),
                  detail: `${expenses.length} catatan tercatat`,
                },
                {
                  label: "Batch terdampak",
                  value: batches.toLocaleString("id-ID"),
                  detail: "batch dengan biaya tercatat",
                },
                {
                  label: "Rata-rata biaya",
                  value: money(expenses.length ? total / expenses.length : 0),
                  detail: "nilai rata-rata per catatan",
                },
              ];
            })()
          : null;

  if (!cards) return null;

  return (
    <div
      className="resource-stats lapak-summary-stats"
      aria-label="Ringkasan data"
    >
      {cards.map((card) => (
        <div className="resource-stat" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <small>{card.detail}</small>
        </div>
      ))}
    </div>
  );
}

function GroupedLapakPage({
  page,
  state,
  onAdd,
  onEdit,
  onDelete,
}: {
  page: string;
  state: BusinessState;
  onAdd: () => void;
  onEdit: (page: string, id: string) => void;
  onDelete: (page: string, id: string) => void;
}) {
  const groups = state.batches
    .map((batch) => {
      if (page === "Commission")
        return {
          batch,
          items: state.commissions
            .filter((item) => item.batchId === batch.id)
            .map((item) => ({
              id: item.id,
              date: item.date,
              title: item.partner,
              detail: item.note || "Komisi Lapak",
              amount: item.amount,
            })),
        };
      if (page === "Expenses")
        return {
          batch,
          items: state.lapakExpenses
            .filter((item) => item.batchId === batch.id)
            .map((item) => ({
              id: item.id,
              date: item.date,
              title: item.expenseName,
              detail: item.notes || "Pengeluaran Lapak",
              amount: item.amount,
            })),
        };
      if (page === "B2C Sales")
        return {
          batch,
          items: state.lapakSales
            .filter((item) => item.batchId === batch.id)
            .map((item) => ({
              id: item.id,
              date: item.date,
              title: item.items.map((line) => line.productName).join(", "),
              detail: `Profit ${money(item.items.reduce((sum, line) => sum + line.profit, 0))}`,
              amount: item.totalAmount,
            })),
        };
      return {
        batch,
        items: state.sourcings
          .filter((item) => item.batchId === batch.id)
          .map((item) => ({
            id: item.id,
            date: item.date,
            title: item.productName,
            detail: `${item.sourceName} · ${item.quantity} ${item.unit}`,
            amount: item.totalCost,
          })),
      };
    })
    .filter((group) => group.items.length > 0);
  const labels: Record<
    string,
    { title: string; description: string; action: string }
  > = {
    Expenses: {
      title: "Pengeluaran Lapak",
      description: "Semua pengeluaran Lapak dipisahkan berdasarkan batch.",
      action: "Tambah pengeluaran",
    },
    Commission: {
      title: "Komisi Lapak",
      description: "Semua komisi ditampilkan berdasarkan batch terkait.",
      action: "Tambah komisi",
    },
    "B2C Sales": {
      title: "Penjualan Lapak",
      description: "Semua penjualan B2C ditampilkan berdasarkan batch terkait.",
      action: "Tambah penjualan",
    },
    "Sourcing & Bengkelan": {
      title: "Pengadaan & Bengkelan",
      description:
        "Semua pengadaan dari supplier dan bengkelan ditampilkan berdasarkan batch terkait.",
      action: "Tambah pengadaan",
    },
  };
  const meta = labels[page];
  return (
    <div className="workspace-page">
      <div className="workspace-page-head">
        <div>
          <p className="eyebrow">Lapak / {meta.title}</p>
          <h1>{meta.title}</h1>
          <p>{meta.description}</p>
        </div>
        <button className="primary-button" type="button" onClick={onAdd}>
          <Plus size={16} /> {meta.action}
        </button>
      </div>
      <LapakSummaryCards page={page} state={state} />
      {groups.length ? (
        <div className="lapak-group-list">
          {groups.map((group) => (
            <section className="panel lapak-batch-group" key={group.batch.id}>
              <div className="lapak-group-heading">
                <div>
                  <p className="eyebrow">Batch</p>
                  <h2>{group.batch.batchNumber}</h2>
                  <small>
                    {group.batch.startDate} ·{" "}
                    {group.batch.notes || "Tanpa catatan"}
                  </small>
                </div>
                <strong>{group.items.length} transaksi</strong>
              </div>
              <div className="batch-item-list">
                {group.items.map((item) => (
                  <div className="batch-item" key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <small>
                        {item.date} · {item.detail}
                      </small>
                    </div>
                    <b>{money(item.amount)}</b>
                    <div className="item-actions">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="Edit data"
                        onClick={() => onEdit(page, item.id)}
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        className="icon-button danger-button"
                        type="button"
                        aria-label="Hapus data"
                        onClick={() => onDelete(page, item.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="panel">
          <div className="empty-state">
            Belum ada data {meta.title.toLowerCase()}. Gunakan tombol tambah
            untuk mencatat transaksi.
          </div>
        </section>
      )}
    </div>
  );
}

export default function WorkspacePage({
  module,
  page,
  business,
  commands,
  onNotify,
  onNavigate,
  initialFormOpen = false,
  initialCreateBatch = false,
  initialInvoiceId,
  initialBatchId,
}: WorkspacePageProps) {
  const effectivePage = resolveWorkspacePage(module, page);
  const [formOpen, setFormOpen] = useState(initialFormOpen);
  const [formPage, setFormPage] = useState(effectivePage);
  const [formBatchId, setFormBatchId] = useState<string | undefined>();
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(
    initialBatchId ?? null,
  );
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editRecord, setEditRecord] = useState<EditRecord | undefined>();
  const [createBatchMode, setCreateBatchMode] = useState(initialCreateBatch);
  const [search, setSearch] = useState("");
  const meta = pageMeta[effectivePage] ?? {
    title: effectivePage,
    description: "Kelola data workspace aktif.",
    action: "Tambah data",
  };
  const workspaceLabel =
    module === "lapak"
      ? "Lapak"
      : module === "resto"
        ? "Resto & Online"
        : "Overview";
  const table = useMemo(() => {
    const rows = getRows(effectivePage, business);
    if (!search.trim()) return rows;
    return {
      ...rows,
      rows: rows.rows.filter((row) =>
        row.join(" ").toLowerCase().includes(search.toLowerCase()),
      ),
    };
  }, [business, effectivePage, search]);
  const openForm = (targetPage: string, batchId?: string) => {
    if (targetPage === "Batches") {
      setCreateBatchMode(true);
      return;
    }
    setFormPage(resolveWorkspacePage(module, targetPage));
    setFormBatchId(batchId ?? selectedBatchId ?? undefined);
    setEditRecord(undefined);
    setFormOpen(true);
  };
  const deleteLapakRecord = (targetPage: string, id: string) => {
    if (!window.confirm("Hapus data ini? Tindakan ini tidak bisa dibatalkan."))
      return;
    const result =
      targetPage === "Commission"
        ? commands.deleteCommission(id)
        : targetPage === "Expenses"
          ? commands.deleteLapakExpense(id)
          : targetPage === "B2C Sales"
            ? commands.deleteLapakSale(id)
            : commands.deleteSourcing(id);
    onNotify(result.message, result.ok ? "success" : "error");
  };
  const editLapakRecord = (targetPage: string, id: string) => {
    setFormPage(targetPage);
    setFormBatchId(undefined);
    setEditRecord({ page: targetPage, id });
    setFormOpen(true);
  };
  const createAndAdd = (
    targetPage: string,
    input: { startDate: string; notes: string },
  ) => {
    const result = commands.createBatch(input);
    onNotify(result.message, result.ok ? "success" : "error");
    if (result.ok && result.id) {
      setCreateBatchMode(false);
      setSelectedBatchId(result.id);
      setFormPage(targetPage);
      setFormBatchId(result.id);
      setFormOpen(true);
    }
  };
  const restoProps = { state: business, commands, onNotify, initialFormOpen };
  if (module === "resto") {
    if (effectivePage === "Stock, Price & Cost")
      return <StockPage {...restoProps} />;
    if (effectivePage === "Suppliers") return <SuppliersPage {...restoProps} />;
    if (effectivePage === "Restaurants")
      return <RestaurantsPage {...restoProps} />;
    if (effectivePage === "Payables") return <PayablesPage {...restoProps} />;
    if (effectivePage === "Operating Expenses")
      return <ExpensesPage {...restoProps} />;
    if (effectivePage === "Pengaturan Resto")
      return (
        <RestoSettingsPage
          business={business}
          commands={commands}
          onNotify={onNotify}
        />
      );
    if (effectivePage === "Laporan Resto" || effectivePage === "Reports")
      return (
        <RestoReportsPage
          business={business}
          onNotify={onNotify}
          onNavigate={onNavigate ?? (() => {})}
        />
      );
  }
  if (effectivePage === "Invoices" || effectivePage === "Payments")
    return (
      <InvoiceWorkspace
        business={business}
        commands={commands}
        onNotify={onNotify}
        page={effectivePage}
        initialFormOpen={initialFormOpen}
        initialInvoiceId={initialInvoiceId}
      />
    );
  if (
    effectivePage === "Batches" &&
    createBatchMode &&
    !selectedBatchId &&
    !editingBatchId
  )
    return (
      <BatchCreateWorkspace
        commands={commands}
        onNotify={onNotify}
        onCancel={() => setCreateBatchMode(false)}
        onCreated={(batchId) => {
          setCreateBatchMode(false);
          setSelectedBatchId(batchId);
        }}
        onCreateAndAdd={createAndAdd}
      />
    );
  if (effectivePage === "Batches" && editingBatchId)
    return (
      <BatchCreateWorkspace
        commands={commands}
        onNotify={onNotify}
        initialBatch={business.batches.find(
          (batch) => batch.id === editingBatchId,
        )}
        onCancel={() => setEditingBatchId(null)}
        onUpdated={() => setEditingBatchId(null)}
      />
    );
  if (
    module === "lapak" &&
    ["Expenses", "Commission", "B2C Sales", "Sourcing & Bengkelan"].includes(
      effectivePage,
    )
  )
    return (
      <>
        <GroupedLapakPage
          page={effectivePage}
          state={business}
          onAdd={() => openForm(effectivePage)}
          onEdit={editLapakRecord}
          onDelete={deleteLapakRecord}
        />
        {formOpen && (
          <ModalForm
            page={formPage}
            editRecord={editRecord}
            initialBatchId={formBatchId}
            state={business}
            commands={commands}
            onClose={() => {
              setFormOpen(false);
              setEditRecord(undefined);
            }}
            onNotify={onNotify}
          />
        )}
      </>
    );
  if (effectivePage === "Batches" && selectedBatchId)
    return (
      <div className="workspace-page">
        <BatchDetail
          batchId={selectedBatchId}
          state={business}
          onBack={() => setSelectedBatchId(null)}
          onAdd={(targetPage) => openForm(targetPage, selectedBatchId)}
          onEdit={editLapakRecord}
          onDelete={deleteLapakRecord}
        />
        {formOpen && (
          <ModalForm
            page={formPage}
            editRecord={editRecord}
            initialBatchId={formBatchId}
            state={business}
            commands={commands}
            onClose={() => {
              setFormOpen(false);
              setEditRecord(undefined);
            }}
            onNotify={onNotify}
          />
        )}
      </div>
    );
  if (effectivePage === "Batches")
    return (
      <BatchListPage
        state={business}
        onCreate={() => setCreateBatchMode(true)}
        onOpen={(id) => setSelectedBatchId(id)}
        onEdit={(id) => setEditingBatchId(id)}
        onDelete={(id) => {
          if (!window.confirm("Hapus batch beserta seluruh transaksinya?"))
            return;
          const result = commands.deleteBatch(id);
          onNotify(result.message, result.ok ? "success" : "error");
        }}
      />
    );
  const stats =
    effectivePage === "Batches"
      ? [
          {
            label: "Batch aktif",
            value: business.batches.length.toString(),
            change: "bisa menerima transaksi",
            direction: "neutral" as const,
          },
          {
            label: "Komisi",
            value: money(
              business.commissions.reduce((sum, item) => sum + item.amount, 0),
            ),
            change: "income Lapak",
            direction: "up" as const,
          },
          {
            label: "Biaya Lapak",
            value: money(
              business.lapakExpenses.reduce(
                (sum, item) => sum + item.amount,
                0,
              ),
            ),
            change: "periode berjalan",
            direction: "neutral" as const,
          },
        ]
      : effectivePage === "Stock, Price & Cost"
        ? [
            {
              label: "Total SKU",
              value: business.products.length.toString(),
              change: `${business.products.filter((item) => item.stockBalance <= item.minimumStock).length} menipis`,
              direction: "neutral" as const,
            },
            {
              label: "Nilai inventory",
              value: money(
                business.products.reduce(
                  (sum, item) => sum + item.stockBalance * item.averageHpp,
                  0,
                ),
              ),
              change: "moving average HPP",
              direction: "up" as const,
            },
            {
              label: "Penerimaan",
              value: business.receipts.length.toString(),
              change: "receipt tersimpan",
              direction: "up" as const,
            },
          ]
        : effectivePage === "Payables"
          ? [
              {
                label: "Utang terverifikasi",
                value: money(
                  business.receipts.reduce(
                    (sum, receipt) => sum + (receiptOutstanding(receipt) ?? 0),
                    0,
                  ),
                ),
                change: "hanya penerimaan dengan data pembayaran",
                direction: "neutral" as const,
              },
              {
                label: "Belum lunas",
                value: business.receipts
                  .filter((receipt) => (receiptOutstanding(receipt) ?? 0) > 0)
                  .length.toString(),
                change: "penerimaan stok Resto",
                direction: "neutral" as const,
              },
              {
                label: "Perlu verifikasi",
                value: business.receipts
                  .filter((receipt) => receiptOutstanding(receipt) === null)
                  .length.toString(),
                change: "pembayaran data lama belum diketahui",
                direction: "neutral" as const,
              },
            ]
          : [
              {
                label: "Total data",
                value: table.rows.length.toString(),
                change: "tersimpan lokal",
                direction: "neutral" as const,
              },
              {
                label: "Module",
                value: workspaceLabel,
                change: "data terpisah",
                direction: "up" as const,
              },
              {
                label: "Storage",
                value: "Local",
                change: "browser aktif",
                direction: "neutral" as const,
              },
            ];

  const exportTable = () => {
    const csv = [table.columns, ...table.rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `${effectivePage.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    onNotify(`${table.rows.length} data berhasil diexport`);
  };

  return (
    <div className="workspace-page" data-page-key={effectivePage}>
      <div className="workspace-page-head">
        <div>
          <p className="eyebrow">
            {workspaceLabel} / {page}
          </p>
          <h1>{meta.title}</h1>
          <p>{meta.description}</p>
        </div>
        <div className="workspace-actions">
          <button
            className="secondary-outline-button"
            type="button"
            onClick={exportTable}
          >
            <Download size={15} /> Export
          </button>
          {![
            "Laporan",
            "Laporan Lapak",
            "Laporan Resto",
            "Reports",
            "Settings",
          ].includes(effectivePage) && (
            <button
              className="primary-button"
              type="button"
              onClick={() =>
                openForm(
                  effectivePage === "Payables"
                    ? "Stock, Price & Cost"
                    : effectivePage,
                )
              }
            >
              <Plus size={16} /> {meta.action}
            </button>
          )}
        </div>
      </div>
      <div className="resource-stats">
        {stats.map((stat) => (
          <div className="resource-stat" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small
              className={
                stat.direction === "up" ? "positive-change" : "neutral-change"
              }
            >
              {stat.direction === "up" && <ArrowUpRight size={13} />}
              {stat.change}
            </small>
          </div>
        ))}
      </div>
      <section className="panel resource-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Data tersimpan</p>
            <h2>{meta.title}</h2>
          </div>
          <button
            className="filter-button"
            type="button"
            onClick={() =>
              onNotify("Gunakan pencarian untuk memfilter data lokal")
            }
          >
            <Filter size={15} /> Filter
          </button>
        </div>
        <div className="resource-toolbar">
          <label className="table-search">
            <Search size={16} />
            <input
              placeholder={`Cari ${meta.title.toLowerCase()}...`}
              aria-label={`Cari ${meta.title}`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <span className="resource-count">
            {table.rows.length} data tampil
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {table.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr
                  className={effectivePage === "Batches" ? "clickable-row" : ""}
                  key={`${row[0]}-${rowIndex}`}
                  onClick={() => {
                    if (effectivePage === "Batches")
                      setSelectedBatchId(String(row[row.length - 1]));
                  }}
                >
                  {row.map((cell, index) => (
                    <td
                      key={`${row[0]}-${index}`}
                      className={index === 0 ? "resource-primary-cell" : ""}
                    >
                      {effectivePage === "Batches" &&
                      index === row.length - 1 ? (
                        <button
                          className="text-link"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedBatchId(String(cell));
                          }}
                        >
                          Lihat detail
                        </button>
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {table.rows.length === 0 && (
            <div className="empty-state">
              Belum ada data. Gunakan tombol di kanan atas untuk menambahkan.
            </div>
          )}
        </div>
      </section>
      {formOpen && (
        <ModalForm
          page={formPage}
          initialBatchId={formBatchId}
          state={business}
          commands={commands}
          onClose={() => setFormOpen(false)}
          onNotify={onNotify}
        />
      )}
    </div>
  );
}
