import { makeId, today, type BusinessState, type CompanyProfile, type ReceiptItem, type StockMovement, type StockMovementType, type UserRole } from "@/src/domain/business-state";
import { USER_ROLES, appendAuditLog } from "@/src/domain/settings";
import { calculateReceiptWeightedAverageCost, receiptSubtotal, skuFromName, validateReceiptItems, validateStockAdjustment } from "@/src/domain/inventory";
import { isBusinessDate, reserveDocumentNumber, reserveSourcingNumber, retainDocumentSequences } from "@/src/domain/business-integrity";
import { BusinessPersistenceError, type BusinessUpdater } from "@/src/application/ports/business-store";
import { calculateInvoice, invoiceStatus, restoreInvoiceStock, type InvoiceInput } from "@/src/domain/invoice";

export type CommandResult = { ok: boolean; message: string; id?: string };
export type PaymentInput = { invoiceId: string; date: string; amount: number; method: string; reference: string; expectedRevision?: number };
export type DeleteInvoiceOptions = { deletePayments?: boolean; acknowledgeMissingItems?: boolean; expectedRevision?: number };

export type ReceiveStockInput = {
  supplierId: string;
  date: string;
  paidAmount: number;
  items?: ReceiptItem[];
  supplierReference?: string;
  dueDate?: string;
  notes?: string;
  /** Single-product shape kept for callers written before multi-item receipts. */
  productId?: string;
  manualWeight?: number;
  digitalWeight?: number;
  unitPurchasePrice?: number;
};
export type ProductInput = { sku?: string; name: string; category: string; size?: string; unit: string; sellingPrice: number; minimumStock?: number; initialCost?: number };
export type SupplierInput = { name: string; contactName: string; phone: string; email?: string; address?: string };
export type RestaurantInput = { name: string; contactName: string; phone: string; email?: string; address?: string; notes?: string; paymentTermDays: number };
export type UserInput = { name: string; email: string; role: UserRole };
export type SupplierPaymentInput = { receiptId: string; date: string; amount: number; method: string; reference: string };
export type PaymentNumber = 1 | 2 | 3;
export type InstallmentInput = { amount: number; date: string };
/**
 * Supports both `updateXPayment(id, 1, input)` and the more self-contained
 * `updateXPayment(id, { paymentNumber: 1, amount, date })` form.
 */
export type PaymentSlotArgument = PaymentNumber | (InstallmentInput & { paymentNumber?: PaymentNumber; slot?: PaymentNumber });
export type SourcingInput = {
  date: string;
  sourceType: "SUPPLIER" | "BENGKELAN";
  name: string;
  type: string;
  weight: number;
  unit: string;
  price: number;
  payment1: number;
  payment1Date: string;
  payment2: number;
  payment2Date: string;
  payment3: number;
  payment3Date: string;
  note: string;
};

export type LapakSaleInput = {
  date: string;
  customerName: string;
  productName: string;
  quantity: number;
  unit: string;
  sellingPrice: number;
  unitCost: number;
  payment1?: number;
  payment1Date?: string;
  payment2?: number;
  payment2Date?: string;
  payment3?: number;
  payment3Date?: string;
};

export function sourcingTotal(input: Pick<SourcingInput, "weight" | "price">): number {
  return input.weight * input.price;
}

export function validateSourcingInput(input: SourcingInput): string | null {
  if (!isBusinessDate(input.date)) return "Tanggal pengadaan wajib valid";
  if (!["SUPPLIER", "BENGKELAN"].includes(input.sourceType)) return "Pilih sumber pengadaan";
  if (!input.name.trim() || !input.type.trim() || !input.unit.trim()) return "Nama, jenis, dan satuan wajib diisi";
  if (!Number.isFinite(input.weight) || input.weight <= 0) return "Bobot harus lebih dari 0";
  if (!Number.isFinite(input.price) || input.price <= 0) return "Harga harus lebih dari 0";
  const total = sourcingTotal(input);
  if (!Number.isFinite(total) || total <= 0) return "Jumlah pengadaan tidak valid";

  const payments = [
    [input.payment1, input.payment1Date, "pertama"],
    [input.payment2, input.payment2Date, "kedua"],
    [input.payment3, input.payment3Date, "ketiga"],
  ] as const;
  let paidTotal = 0;
  for (const [amount, date, label] of payments) {
    if (!Number.isFinite(amount) || amount < 0) return `Pembayaran ${label} tidak valid`;
    if (date && (!isBusinessDate(date) || date < input.date)) return `Tanggal pembayaran ${label} tidak valid`;
    if (amount > 0 && !date) return `Tanggal pembayaran ${label} wajib diisi`;
    paidTotal += amount;
  }
  if (paidTotal > sourcingTotal(input)) return "Total pembayaran tidak boleh melebihi jumlah pengadaan";
  return null;
}

export function normalizedSourcingInput(input: SourcingInput): Omit<SourcingInput, never> {
  return {
    date: input.date,
    sourceType: input.sourceType,
    name: input.name.trim(),
    type: input.type.trim(),
    weight: input.weight,
    unit: input.unit.trim(),
    price: input.price,
    payment1: input.payment1,
    payment1Date: input.payment1Date?.trim() ?? "",
    payment2: input.payment2,
    payment2Date: input.payment2Date?.trim() ?? "",
    payment3: input.payment3,
    payment3Date: input.payment3Date?.trim() ?? "",
    note: input.note.trim(),
  };
}

function paymentSlot(argument: PaymentSlotArgument, input?: InstallmentInput | null): { slot: PaymentNumber | null; value: InstallmentInput } {
  if (typeof argument === "number") return { slot: argument, value: input ?? { amount: 0, date: "" } };
  return {
    slot: argument.paymentNumber ?? argument.slot ?? null,
    value: { amount: argument.amount, date: argument.date },
  };
}

function slotFields(slot: PaymentNumber): { amount: "payment1" | "payment2" | "payment3"; date: "payment1Date" | "payment2Date" | "payment3Date" } {
  return { amount: `payment${slot}` as "payment1" | "payment2" | "payment3", date: `payment${slot}Date` as "payment1Date" | "payment2Date" | "payment3Date" };
}

function validatePaymentValue(value: InstallmentInput, recordDate: string, label: string, total: number, otherPaid: number): string | null {
  if (!Number.isFinite(value.amount) || value.amount < 0) return `Nominal ${label} tidak valid`;
  // An empty slot is always valid: clearing a payment never depends on a date or the remaining balance.
  if (value.amount === 0) return null;
  const date = value.date?.trim() ?? "";
  if (date && (!isBusinessDate(date) || date < recordDate)) return `Tanggal ${label} tidak valid`;
  if (value.amount > 0 && !date) return `Tanggal ${label} wajib diisi`;
  if (otherPaid + value.amount > total) return `Total pembayaran melebihi jumlah transaksi`;
  return null;
}

function lapakSalePayments(input: LapakSaleInput, previous?: BusinessState["lapakSales"][number]) {
  return [
    { amount: input.payment1 ?? previous?.payment1 ?? 0, date: input.payment1Date ?? previous?.payment1Date ?? "" },
    { amount: input.payment2 ?? previous?.payment2 ?? 0, date: input.payment2Date ?? previous?.payment2Date ?? "" },
    { amount: input.payment3 ?? previous?.payment3 ?? 0, date: input.payment3Date ?? previous?.payment3Date ?? "" },
  ] as const;
}

function validateLapakSaleInput(input: LapakSaleInput, previous?: BusinessState["lapakSales"][number]): string | null {
  if (!isBusinessDate(input.date)) return "Tanggal penjualan wajib valid";
  if (!input.customerName.trim()) return "Customer wajib diisi";
  if (!input.productName.trim() || !Number.isFinite(input.quantity) || input.quantity <= 0 || !Number.isFinite(input.sellingPrice) || input.sellingPrice <= 0 || !Number.isFinite(input.unitCost) || input.unitCost < 0 || !input.unit.trim()) return "Produk, quantity, satuan, dan harga penjualan wajib valid";
  const total = input.quantity * input.sellingPrice;
  if (!Number.isFinite(total) || total <= 0) return "Jumlah penjualan tidak valid";
  const payments = lapakSalePayments(input, previous);
  let otherPaid = 0;
  for (const [index, payment] of payments.entries()) {
    const validation = validatePaymentValue(payment, input.date, `pembayaran ${index + 1}`, total, otherPaid);
    if (validation) return validation;
    otherPaid += payment.amount;
  }
  return null;
}

export type BusinessCommands = {
  runTransaction: (execute: (commands: BusinessCommands) => CommandResult) => CommandResult;
  createBatch: (input: { startDate: string; notes: string }) => CommandResult;
  updateBatch: (id: string, input: { startDate: string; notes: string }) => CommandResult;
  deleteBatch: (id: string) => CommandResult;
  addCommission: (input: { batchId: string; date: string; partner: string; amount: number; note: string }) => CommandResult;
  updateCommission: (id: string, input: { batchId: string; date: string; partner: string; amount: number; note: string }) => CommandResult;
  deleteCommission: (id: string) => CommandResult;
  addSourcing: (input: SourcingInput) => CommandResult;
  updateSourcing: (id: string, input: SourcingInput) => CommandResult;
  updateSourcingPayment: (id: string, payment: PaymentSlotArgument, input?: InstallmentInput | null) => CommandResult;
  deleteSourcing: (id: string) => CommandResult;
  addLapakSale: (input: LapakSaleInput) => CommandResult;
  updateLapakSale: (id: string, input: LapakSaleInput) => CommandResult;
  updateLapakSalePayment: (id: string, payment: PaymentSlotArgument, input?: InstallmentInput | null) => CommandResult;
  deleteLapakSale: (id: string) => CommandResult;
  addLapakExpense: (input: { batchId: string; date: string; expenseName: string; amount: number; notes: string }) => CommandResult;
  updateLapakExpense: (id: string, input: { batchId: string; date: string; expenseName: string; amount: number; notes: string }) => CommandResult;
  deleteLapakExpense: (id: string) => CommandResult;
  addProduct: (input: ProductInput) => CommandResult;
  updateProduct: (id: string, input: Omit<ProductInput, "sku" | "initialCost">) => CommandResult;
  toggleProductStatus: (id: string) => CommandResult;
  deleteProduct: (id: string) => CommandResult;
  adjustStock: (productId: string, input: { actualQuantity: number; minimumStock: number; notes: string }) => CommandResult;
  adjustProductCost: (productId: string, input: { newCost: number; reason: string }) => CommandResult;
  setCustomerPrice: (input: { restaurantId: string; productId: string; sellingPrice: number }) => CommandResult;
  deleteCustomerPrice: (id: string) => CommandResult;
  addSupplier: (input: SupplierInput) => CommandResult;
  updateSupplier: (id: string, input: SupplierInput) => CommandResult;
  toggleSupplierStatus: (id: string) => CommandResult;
  deleteSupplier: (id: string) => CommandResult;
  addRestaurant: (input: RestaurantInput) => CommandResult;
  updateRestaurant: (id: string, input: RestaurantInput) => CommandResult;
  toggleRestaurantStatus: (id: string) => CommandResult;
  deleteRestaurant: (id: string) => CommandResult;
  receiveStock: (input: ReceiveStockInput) => CommandResult;
  cancelStockReceipt: (id: string, reason: string) => CommandResult;
  paySupplierReceipt: (input: SupplierPaymentInput) => CommandResult;
  verifyReceiptPayment: (id: string, paidAmount: number) => CommandResult;
  createInvoice: (input: InvoiceInput) => CommandResult;
  updateInvoice: (id: string, input: InvoiceInput) => CommandResult;
  deleteInvoice: (id: string, options?: DeleteInvoiceOptions) => CommandResult;
  addPayment: (input: PaymentInput) => CommandResult;
  updatePayment: (id: string, input: PaymentInput) => CommandResult;
  deletePayment: (id: string, expectedRevision?: number) => CommandResult;
  addOperatingExpense: (input: { date: string; category: string; description: string; amount: number }) => CommandResult;
  updateOperatingExpense: (id: string, input: { date: string; category: string; description: string; amount: number }) => CommandResult;
  deleteOperatingExpense: (id: string) => CommandResult;
  addNote: (input: { title: string; content: string }) => CommandResult;
  updateCompany: (input: CompanyProfile) => CommandResult;
  addUser: (input: UserInput) => CommandResult;
  updateUser: (id: string, input: UserInput) => CommandResult;
  toggleUserStatus: (id: string) => CommandResult;
};

const movement = (date: string, productId: string, type: StockMovementType, quantity: number, balanceAfter: number, unitCost: number, reference: string, notes = ""): StockMovement => ({ id: makeId("movement"), date, productId, type, quantity, balanceAfter, unitCost, reference, notes });

// Derives ledger rows from the stock change an invoice caused, so the ledger cannot drift from balances.
function invoiceMovements(before: BusinessState["products"], after: BusinessState["products"], date: string, reference: string): StockMovement[] {
  return after.flatMap((product) => {
    const previous = before.find((item) => item.id === product.id);
    const delta = Number((product.stockBalance - (previous?.stockBalance ?? 0)).toFixed(9));
    if (!previous || delta === 0) return [];
    return [movement(date, product.id, delta < 0 ? "SALE_OUT" : "INVOICE_VOID_RETURN", delta, product.stockBalance, product.averageHpp, reference)];
  });
}

export function createBusinessCommands(persistState: (updater: BusinessUpdater) => void, getState: () => BusinessState, getActor?: () => string | undefined): BusinessCommands {
  const audit = (state: BusinessState, action: string, entityName: string, reference: string) =>
    appendAuditLog(state, action, entityName, reference, makeId("audit"), getActor?.());
  const setState = (updater: BusinessUpdater) => persistState((state) => updater(retainDocumentSequences(state)));
  const changePayment = (id: string | undefined, input: PaymentInput | null, expectedRevision?: number): CommandResult => {
    const state = getState();
    const previous = id ? state.payments.find((payment) => payment.id === id) : undefined;
    if (id && !previous) return { ok: false, message: "Pembayaran tidak ditemukan" };
    if (previous && expectedRevision !== undefined && (previous.revision ?? 0) !== expectedRevision) return { ok: false, message: "Pembayaran berubah. Buka ulang sebelum mengoreksi." };
    const invoiceId = input?.invoiceId ?? previous?.invoiceId;
    if (previous && input && input.invoiceId !== previous.invoiceId) return { ok: false, message: "Untuk memindahkan pembayaran, hapus catatan lama lalu catat pada invoice yang benar." };
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    if (!invoice) return { ok: false, message: "Invoice tidak ditemukan" };
    if (input && (!isBusinessDate(input.date) || input.date < invoice.date)) return { ok: false, message: "Tanggal pembayaran tidak boleh sebelum tanggal invoice" };
    if (input && (!Number.isSafeInteger(input.amount) || input.amount <= 0 || !["Transfer", "Tunai"].includes(input.method))) return { ok: false, message: "Nominal pembayaran harus Rupiah utuh lebih dari 0 dan metode wajib dipilih" };
    const paidAmount = invoice.paidAmount - (previous?.amount ?? 0) + (input?.amount ?? 0);
    if (paidAmount < 0 || paidAmount > invoice.total) return { ok: false, message: "Pembayaran melebihi sisa tagihan atau saldo pembayaran tidak konsisten" };
    const paymentId = previous?.id ?? makeId("payment");
    setState((current) => audit({
      ...current,
      invoices: current.invoices.map((item) => item.id === invoice.id ? { ...item, revision: (item.revision ?? 0) + 1, paidAmount, outstandingAmount: item.total - paidAmount, status: invoiceStatus(item.total, paidAmount) } : item),
      payments: input ? [...current.payments.filter((item) => item.id !== paymentId), { id: paymentId, revision: (previous?.revision ?? 0) + 1, invoiceId: invoice.id, date: input.date, amount: input.amount, method: input.method, reference: input.reference.trim() }] : current.payments.filter((item) => item.id !== paymentId),
    }, input ? previous ? "PAYMENT_UPDATED" : "PAYMENT_RECORDED" : "PAYMENT_DELETED", "Pembayaran", invoice.invoiceNumber));
    return { ok: true, id: paymentId, message: input ? previous ? "Pembayaran berhasil diperbarui" : "Pembayaran berhasil dicatat" : "Pembayaran dihapus dan piutang dihitung ulang" };
  };
  const changeSourcingPayment = (id: string, argument: PaymentSlotArgument, input?: InstallmentInput | null): CommandResult => {
    const state = getState();
    const sourcing = state.sourcings.find((item) => item.id === id);
    if (!sourcing) return { ok: false, message: "Pengadaan tidak ditemukan" };
    const resolved = paymentSlot(argument, input);
    if (!resolved.slot || ![1, 2, 3].includes(resolved.slot)) return { ok: false, message: "Tahap pembayaran tidak valid" };
    const fields = slotFields(resolved.slot);
    const currentPaid = sourcing.payment1 + sourcing.payment2 + sourcing.payment3;
    const otherPaid = currentPaid - sourcing[fields.amount];
    const value = { amount: resolved.value.amount, date: resolved.value.date?.trim() ?? "" };
    const validation = validatePaymentValue(value, sourcing.date, `pembayaran ${resolved.slot}`, sourcing.total, otherPaid);
    if (validation) return { ok: false, message: validation };
    const normalizedDate = value.amount > 0 ? value.date : "";
    setState((current) => audit({
      ...current,
      sourcings: current.sourcings.map((item) => item.id === id ? { ...item, [fields.amount]: value.amount, [fields.date]: normalizedDate } : item),
    }, value.amount > 0 ? "SOURCING_PAYMENT_UPDATED" : "SOURCING_PAYMENT_CLEARED", "Pembayaran pengadaan", `${sourcing.name} · tahap ${resolved.slot}`));
    return { ok: true, message: value.amount > 0 ? "Pembayaran pengadaan berhasil disimpan" : "Pembayaran pengadaan dikosongkan" };
  };
  const changeLapakSalePayment = (id: string, argument: PaymentSlotArgument, input?: InstallmentInput | null): CommandResult => {
    const state = getState();
    const sale = state.lapakSales.find((item) => item.id === id);
    if (!sale) return { ok: false, message: "Penjualan tidak ditemukan" };
    const resolved = paymentSlot(argument, input);
    if (!resolved.slot || ![1, 2, 3].includes(resolved.slot)) return { ok: false, message: "Tahap pembayaran tidak valid" };
    const fields = slotFields(resolved.slot);
    const currentPaid = sale.payment1 + sale.payment2 + sale.payment3;
    const otherPaid = currentPaid - sale[fields.amount];
    const value = { amount: resolved.value.amount, date: resolved.value.date?.trim() ?? "" };
    const validation = validatePaymentValue(value, sale.date, `pembayaran ${resolved.slot}`, sale.totalAmount, otherPaid);
    if (validation) return { ok: false, message: validation };
    const normalizedDate = value.amount > 0 ? value.date : "";
    setState((current) => audit({
      ...current,
      lapakSales: current.lapakSales.map((item) => item.id === id ? { ...item, [fields.amount]: value.amount, [fields.date]: normalizedDate } : item),
    }, value.amount > 0 ? "LAPAK_SALE_PAYMENT_UPDATED" : "LAPAK_SALE_PAYMENT_CLEARED", "Pembayaran penjualan Lapak", `${sale.customerName} · tahap ${resolved.slot}`));
    return { ok: true, message: value.amount > 0 ? "Pembayaran penjualan berhasil disimpan" : "Pembayaran penjualan dikosongkan" };
  };
  const commands: BusinessCommands = {
    runTransaction: (execute) => {
      let staged = getState();
      const stagedCommands = createBusinessCommands((updater) => { staged = updater(staged); }, () => staged);
      const result = execute(stagedCommands);
      if (result.ok) setState(() => staged);
      return result;
    },
    createBatch: (input) => {
      if (!input.startDate) return { ok: false, message: "Tanggal mulai batch wajib diisi" };
      const [year, month, day] = input.startDate.split("-");
      const id = makeId("batch");
      setState((state) => {
        const reserved = reserveDocumentNumber(state, `BAT-${day}${month}${year.slice(-2)}-`, 3);
        return { ...state, numberSequences: reserved.numberSequences, batches: [...state.batches, { id, batchNumber: reserved.number, startDate: input.startDate, notes: input.notes.trim() }] };
      });
      return { ok: true, id, message: "Batch Lapak berhasil dibuat" };
    },
    updateBatch: (id, input) => {
      if (!input.startDate) return { ok: false, message: "Tanggal mulai batch wajib diisi" };
      if (!getState().batches.some((batch) => batch.id === id)) return { ok: false, message: "Batch tidak ditemukan" };
      const [year, month, day] = input.startDate.split("-");
      setState((state) => {
        const current = state.batches.find((batch) => batch.id === id)!;
        const reserved = current.startDate === input.startDate ? null : reserveDocumentNumber(state, `BAT-${day}${month}${year.slice(-2)}-`, 3);
        return { ...state, numberSequences: reserved?.numberSequences ?? state.numberSequences, batches: state.batches.map((batch) => batch.id === id ? { ...batch, batchNumber: reserved?.number ?? batch.batchNumber, startDate: input.startDate, notes: input.notes.trim() } : batch) };
      });
      return { ok: true, message: "Batch berhasil diperbarui" };
    },
    deleteBatch: (id) => {
      if (!getState().batches.some((batch) => batch.id === id)) return { ok: false, message: "Batch tidak ditemukan" };
      setState((state) => ({ ...state, batches: state.batches.filter((batch) => batch.id !== id), commissions: state.commissions.filter((item) => item.batchId !== id), lapakExpenses: state.lapakExpenses.filter((item) => item.batchId !== id) }));
      return { ok: true, message: "Batch dan seluruh transaksinya berhasil dihapus" };
    },
    addCommission: (input) => {
      const batch = getState().batches.find((item) => item.id === input.batchId);
      if (!batch) return { ok: false, message: "Pilih batch Lapak yang tersedia" };
      if (!input.partner.trim() || !Number.isFinite(input.amount) || input.amount === 0) return { ok: false, message: "Partner dan jumlah komisi wajib diisi; komisi boleh positif atau negatif" };
      setState((state) => ({ ...state, commissions: [...state.commissions, { id: makeId("commission"), ...input, partner: input.partner.trim() }] }));
      return { ok: true, message: "Komisi berhasil dicatat" };
    },
    updateCommission: (id, input) => {
      if (!getState().batches.some((batch) => batch.id === input.batchId)) return { ok: false, message: "Pilih batch Lapak yang tersedia" };
      if (!input.partner.trim() || !Number.isFinite(input.amount) || input.amount === 0) return { ok: false, message: "Partner dan jumlah komisi wajib diisi; komisi boleh positif atau negatif" };
      if (!getState().commissions.some((item) => item.id === id)) return { ok: false, message: "Komisi tidak ditemukan" };
      setState((state) => ({ ...state, commissions: state.commissions.map((item) => item.id === id ? { ...item, ...input, partner: input.partner.trim() } : item) }));
      return { ok: true, message: "Komisi berhasil diperbarui" };
    },
    deleteCommission: (id) => {
      if (!getState().commissions.some((item) => item.id === id)) return { ok: false, message: "Komisi tidak ditemukan" };
      setState((state) => ({ ...state, commissions: state.commissions.filter((item) => item.id !== id) }));
      return { ok: true, message: "Komisi berhasil dihapus" };
    },
    addSourcing: (input) => {
      const validation = validateSourcingInput(input);
      if (validation) return { ok: false, message: validation };
      const id = makeId("sourcing");
      setState((state) => {
        const reserved = reserveSourcingNumber(state);
        const total = sourcingTotal(input);
        return {
          ...state,
          numberSequences: reserved.numberSequences,
          sourcings: [...state.sourcings, { id, sequence: reserved.sequence, ...normalizedSourcingInput(input), total }],
        };
      });
      return { ok: true, id, message: "Pengadaan berhasil dicatat tanpa mengubah inventory" };
    },
    updateSourcing: (id, input) => {
      if (!getState().sourcings.some((item) => item.id === id)) return { ok: false, message: "Pengadaan tidak ditemukan" };
      const validation = validateSourcingInput(input);
      if (validation) return { ok: false, message: validation };
      setState((state) => ({ ...state, sourcings: state.sourcings.map((item) => item.id === id ? { ...item, ...normalizedSourcingInput(input), total: sourcingTotal(input) } : item) }));
      return { ok: true, message: "Pengadaan berhasil diperbarui" };
    },
    updateSourcingPayment: (id, payment, input) => changeSourcingPayment(id, payment, input),
    deleteSourcing: (id) => {
      if (!getState().sourcings.some((item) => item.id === id)) return { ok: false, message: "Pengadaan tidak ditemukan" };
      setState((state) => ({ ...state, sourcings: state.sourcings.filter((item) => item.id !== id) }));
      return { ok: true, message: "Pengadaan berhasil dihapus" };
    },
    addLapakSale: (input) => {
      const validation = validateLapakSaleInput(input);
      if (validation) return { ok: false, message: validation };
      const subtotal = input.quantity * input.sellingPrice;
      const costTotal = input.quantity * input.unitCost;
      const payments = lapakSalePayments(input);
      setState((state) => ({ ...state, lapakSales: [...state.lapakSales, { id: makeId("lapak-sale"), date: input.date, customerName: input.customerName.trim(), totalAmount: subtotal, payment1: payments[0].amount, payment1Date: payments[0].amount > 0 ? payments[0].date.trim() : "", payment2: payments[1].amount, payment2Date: payments[1].amount > 0 ? payments[1].date.trim() : "", payment3: payments[2].amount, payment3Date: payments[2].amount > 0 ? payments[2].date.trim() : "", items: [{ productName: input.productName.trim(), quantity: input.quantity, unit: input.unit.trim(), sellingPrice: input.sellingPrice, unitCost: input.unitCost, subtotal, costTotal, profit: subtotal - costTotal }] }] }));
      return { ok: true, message: "Penjualan Lapak berhasil dicatat" };
    },
    updateLapakSale: (id, input) => {
      const current = getState().lapakSales.find((item) => item.id === id);
      if (!current) return { ok: false, message: "Penjualan tidak ditemukan" };
      const validation = validateLapakSaleInput(input, current);
      if (validation) return { ok: false, message: validation };
      const subtotal = input.quantity * input.sellingPrice;
      const costTotal = input.quantity * input.unitCost;
      const payments = lapakSalePayments(input, current);
      setState((state) => ({ ...state, lapakSales: state.lapakSales.map((sale) => sale.id === id ? { ...sale, date: input.date, customerName: input.customerName.trim(), totalAmount: subtotal, payment1: payments[0].amount, payment1Date: payments[0].amount > 0 ? payments[0].date.trim() : "", payment2: payments[1].amount, payment2Date: payments[1].amount > 0 ? payments[1].date.trim() : "", payment3: payments[2].amount, payment3Date: payments[2].amount > 0 ? payments[2].date.trim() : "", items: [{ productName: input.productName.trim(), quantity: input.quantity, unit: input.unit.trim(), sellingPrice: input.sellingPrice, unitCost: input.unitCost, subtotal, costTotal, profit: subtotal - costTotal }] } : sale) }));
      return { ok: true, message: "Penjualan Lapak berhasil diperbarui" };
    },
    updateLapakSalePayment: (id, payment, input) => changeLapakSalePayment(id, payment, input),
    deleteLapakSale: (id) => {
      if (!getState().lapakSales.some((item) => item.id === id)) return { ok: false, message: "Penjualan tidak ditemukan" };
      setState((state) => ({ ...state, lapakSales: state.lapakSales.filter((item) => item.id !== id) }));
      return { ok: true, message: "Penjualan berhasil dihapus" };
    },
    addLapakExpense: (input) => {
      const batch = getState().batches.find((item) => item.id === input.batchId);
      if (!batch) return { ok: false, message: "Pilih batch Lapak yang tersedia" };
      if (!input.expenseName.trim() || input.amount <= 0) return { ok: false, message: "Nama dan jumlah pengeluaran wajib diisi" };
      setState((state) => ({ ...state, lapakExpenses: [...state.lapakExpenses, { id: makeId("lapak-expense"), ...input, expenseName: input.expenseName.trim() }] }));
      return { ok: true, message: "Pengeluaran Lapak berhasil dicatat" };
    },
    updateLapakExpense: (id, input) => {
      if (!getState().batches.some((batch) => batch.id === input.batchId)) return { ok: false, message: "Pilih batch Lapak yang tersedia" };
      if (!input.expenseName.trim() || input.amount <= 0) return { ok: false, message: "Nama dan jumlah pengeluaran wajib diisi" };
      if (!getState().lapakExpenses.some((item) => item.id === id)) return { ok: false, message: "Pengeluaran tidak ditemukan" };
      setState((state) => ({ ...state, lapakExpenses: state.lapakExpenses.map((item) => item.id === id ? { ...item, ...input, expenseName: input.expenseName.trim() } : item) }));
      return { ok: true, message: "Pengeluaran Lapak berhasil diperbarui" };
    },
    deleteLapakExpense: (id) => {
      if (!getState().lapakExpenses.some((item) => item.id === id)) return { ok: false, message: "Pengeluaran tidak ditemukan" };
      setState((state) => ({ ...state, lapakExpenses: state.lapakExpenses.filter((item) => item.id !== id) }));
      return { ok: true, message: "Pengeluaran berhasil dihapus" };
    },
    addProduct: (input) => {
      const name = input.name.trim();
      const category = input.category.trim();
      const size = (input.size ?? "").trim();
      const minimumStock = input.minimumStock ?? 0;
      const initialCost = input.initialCost ?? 0;
      if (!name || !category || !input.unit.trim()) return { ok: false, message: "Nama, kategori, dan satuan wajib diisi" };
      if (!Number.isFinite(input.sellingPrice) || input.sellingPrice < 0 || minimumStock < 0 || !Number.isFinite(initialCost) || initialCost < 0) return { ok: false, message: "Harga jual, HPP, dan stok minimum tidak boleh negatif" };
      const state = getState();
      const sku = input.sku?.trim() || skuFromName(name, category, state.products.map((product) => product.sku));
      if (state.products.some((product) => product.sku.toLowerCase() === sku.toLowerCase())) return { ok: false, message: "SKU sudah digunakan" };
      if (state.products.some((product) => product.name.toLowerCase() === name.toLowerCase() && product.size.toLowerCase() === size.toLowerCase() && product.category.toLowerCase() === category.toLowerCase())) return { ok: false, message: "Produk dengan nama, kategori, dan ukuran yang sama sudah ada" };
      const id = makeId("product");
      setState((current) => ({ ...current, products: [...current.products, { id, sku, name, category, size, unit: input.unit.trim(), defaultSellingPrice: input.sellingPrice, averageHpp: initialCost, latestPurchaseCost: initialCost, stockBalance: 0, minimumStock, status: "ACTIVE" }] }));
      return { ok: true, id, message: "Produk berhasil ditambahkan" };
    },
    updateProduct: (id, input) => {
      const state = getState();
      const current = state.products.find((product) => product.id === id);
      if (!current) return { ok: false, message: "Produk tidak ditemukan" };
      const name = input.name.trim();
      const category = input.category.trim();
      const size = (input.size ?? "").trim();
      if (!name || !category || !input.unit.trim()) return { ok: false, message: "Nama, kategori, dan satuan wajib diisi" };
      if (!Number.isFinite(input.sellingPrice) || input.sellingPrice < 0 || (input.minimumStock ?? 0) < 0) return { ok: false, message: "Harga jual dan stok minimum tidak boleh negatif" };
      if (state.products.some((product) => product.id !== id && product.name.toLowerCase() === name.toLowerCase() && product.size.toLowerCase() === size.toLowerCase() && product.category.toLowerCase() === category.toLowerCase())) return { ok: false, message: "Produk dengan nama, kategori, dan ukuran yang sama sudah ada" };
      setState((draft) => ({ ...draft, products: draft.products.map((product) => product.id === id ? { ...product, name, category, size, unit: input.unit.trim(), defaultSellingPrice: input.sellingPrice, minimumStock: input.minimumStock ?? product.minimumStock } : product) }));
      return { ok: true, message: "Produk berhasil diperbarui" };
    },
    toggleProductStatus: (id) => {
      const product = getState().products.find((item) => item.id === id);
      if (!product) return { ok: false, message: "Produk tidak ditemukan" };
      setState((state) => ({ ...state, products: state.products.map((item) => item.id === id ? { ...item, status: item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } : item) }));
      return { ok: true, message: product.status === "ACTIVE" ? "Produk dinonaktifkan" : "Produk diaktifkan" };
    },
    deleteProduct: (id) => {
      const state = getState();
      if (!state.products.some((item) => item.id === id)) return { ok: false, message: "Produk tidak ditemukan" };
      const used = state.invoices.some((invoice) => invoice.items.some((item) => item.productId === id)) || state.receipts.some((receipt) => receipt.items.some((item) => item.productId === id)) || state.stockMovements.some((item) => item.productId === id);
      if (used) return { ok: false, message: "Produk sudah punya riwayat transaksi. Nonaktifkan produk agar riwayat tetap utuh." };
      setState((current) => ({ ...current, products: current.products.filter((item) => item.id !== id), customerPrices: current.customerPrices.filter((item) => item.productId !== id) }));
      return { ok: true, message: "Produk berhasil dihapus" };
    },
    adjustStock: (productId, input) => {
      const product = getState().products.find((item) => item.id === productId);
      if (!product) return { ok: false, message: "Produk tidak ditemukan" };
      if (!Number.isFinite(input.minimumStock) || input.minimumStock < 0) return { ok: false, message: "Batas minimum stok tidak valid" };
      const error = validateStockAdjustment(input.actualQuantity, product.stockBalance, input.notes);
      if (error) return { ok: false, message: error };
      const delta = Number((input.actualQuantity - product.stockBalance).toFixed(9));
      setState((state) => ({
        ...state,
        products: state.products.map((item) => item.id === productId ? { ...item, stockBalance: input.actualQuantity, minimumStock: input.minimumStock } : item),
        stockMovements: delta === 0 ? state.stockMovements : [...state.stockMovements, movement(today(), productId, delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT", delta, input.actualQuantity, product.averageHpp, "Penyesuaian manual", input.notes.trim())],
      }));
      return { ok: true, message: delta === 0 ? "Batas minimum stok diperbarui" : "Stok berhasil disesuaikan" };
    },
    adjustProductCost: (productId, input) => {
      const product = getState().products.find((item) => item.id === productId);
      if (!product) return { ok: false, message: "Produk tidak ditemukan" };
      if (!Number.isFinite(input.newCost) || input.newCost < 0) return { ok: false, message: "HPP baru tidak boleh negatif" };
      if (!input.reason.trim()) return { ok: false, message: "Alasan penyesuaian HPP wajib diisi" };
      setState((state) => audit({
        ...state,
        products: state.products.map((item) => item.id === productId ? { ...item, averageHpp: input.newCost } : item),
        stockMovements: [...state.stockMovements, movement(today(), productId, "COST_ADJUSTMENT", 0, product.stockBalance, input.newCost, `HPP ${Math.round(product.averageHpp)} → ${Math.round(input.newCost)}`, input.reason.trim())],
      }, "PRODUCT_COST_CHANGED", "Produk", product.name));
      return { ok: true, message: "HPP berhasil disesuaikan" };
    },
    setCustomerPrice: (input) => {
      const state = getState();
      if (!state.restaurants.some((item) => item.id === input.restaurantId)) return { ok: false, message: "Pilih restoran" };
      if (!state.products.some((item) => item.id === input.productId)) return { ok: false, message: "Pilih produk" };
      if (!Number.isSafeInteger(input.sellingPrice) || input.sellingPrice <= 0) return { ok: false, message: "Harga jual harus Rupiah utuh lebih dari 0" };
      const existing = state.customerPrices.find((item) => item.restaurantId === input.restaurantId && item.productId === input.productId);
      const id = existing?.id ?? makeId("price");
      setState((current) => audit({ ...current, customerPrices: [...current.customerPrices.filter((item) => item.id !== id), { id, restaurantId: input.restaurantId, productId: input.productId, sellingPrice: input.sellingPrice, date: today() }] }, "CUSTOMER_PRICE_CHANGED", "Harga pelanggan", `${state.restaurants.find((item) => item.id === input.restaurantId)?.name ?? ""} · ${state.products.find((item) => item.id === input.productId)?.name ?? ""}`));
      return { ok: true, id, message: existing ? "Harga khusus diperbarui" : "Harga khusus restoran disimpan" };
    },
    deleteCustomerPrice: (id) => {
      if (!getState().customerPrices.some((item) => item.id === id)) return { ok: false, message: "Harga khusus tidak ditemukan" };
      setState((state) => ({ ...state, customerPrices: state.customerPrices.filter((item) => item.id !== id) }));
      return { ok: true, message: "Harga khusus dihapus; produk kembali memakai harga standar" };
    },
    addSupplier: (input) => {
      if (!input.name.trim()) return { ok: false, message: "Nama supplier wajib diisi" };
      const id = makeId("supplier");
      setState((state) => ({ ...state, suppliers: [...state.suppliers, { id, name: input.name.trim(), contactName: input.contactName.trim(), phone: input.phone.trim(), email: (input.email ?? "").trim(), address: (input.address ?? "").trim(), status: "ACTIVE" }] }));
      return { ok: true, id, message: "Supplier berhasil ditambahkan" };
    },
    updateSupplier: (id, input) => {
      if (!getState().suppliers.some((item) => item.id === id)) return { ok: false, message: "Supplier tidak ditemukan" };
      if (!input.name.trim()) return { ok: false, message: "Nama supplier wajib diisi" };
      setState((state) => ({ ...state, suppliers: state.suppliers.map((item) => item.id === id ? { ...item, name: input.name.trim(), contactName: input.contactName.trim(), phone: input.phone.trim(), email: (input.email ?? "").trim(), address: (input.address ?? "").trim() } : item) }));
      return { ok: true, message: "Supplier berhasil diperbarui" };
    },
    toggleSupplierStatus: (id) => {
      const supplier = getState().suppliers.find((item) => item.id === id);
      if (!supplier) return { ok: false, message: "Supplier tidak ditemukan" };
      setState((state) => ({ ...state, suppliers: state.suppliers.map((item) => item.id === id ? { ...item, status: item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } : item) }));
      return { ok: true, message: supplier.status === "ACTIVE" ? "Supplier dinonaktifkan" : "Supplier diaktifkan" };
    },
    deleteSupplier: (id) => {
      const state = getState();
      if (!state.suppliers.some((item) => item.id === id)) return { ok: false, message: "Supplier tidak ditemukan" };
      if (state.receipts.some((receipt) => receipt.supplierId === id)) return { ok: false, message: "Supplier sudah punya penerimaan stok. Nonaktifkan supplier agar riwayat tetap utuh." };
      setState((current) => ({ ...current, suppliers: current.suppliers.filter((item) => item.id !== id) }));
      return { ok: true, message: "Supplier berhasil dihapus" };
    },
    addRestaurant: (input) => {
      if (!input.name.trim() || !Number.isSafeInteger(input.paymentTermDays) || input.paymentTermDays < 0 || input.paymentTermDays > 3650) return { ok: false, message: "Nama restoran wajib diisi dan termin harus 0–3650 hari penuh" };
      const id = makeId("restaurant");
      setState((state) => ({ ...state, restaurants: [...state.restaurants, { id, name: input.name.trim(), contactName: input.contactName.trim(), phone: input.phone.trim(), email: (input.email ?? "").trim(), address: (input.address ?? "").trim(), notes: (input.notes ?? "").trim(), paymentTermDays: input.paymentTermDays, status: "ACTIVE" }] }));
      return { ok: true, id, message: "Restoran berhasil ditambahkan" };
    },
    updateRestaurant: (id, input) => {
      if (!getState().restaurants.some((item) => item.id === id)) return { ok: false, message: "Restoran tidak ditemukan" };
      if (!input.name.trim() || !Number.isSafeInteger(input.paymentTermDays) || input.paymentTermDays < 0 || input.paymentTermDays > 3650) return { ok: false, message: "Nama restoran wajib diisi dan termin harus 0–3650 hari penuh" };
      setState((state) => ({ ...state, restaurants: state.restaurants.map((item) => item.id === id ? { ...item, name: input.name.trim(), contactName: input.contactName.trim(), phone: input.phone.trim(), email: (input.email ?? "").trim(), address: (input.address ?? "").trim(), notes: (input.notes ?? "").trim(), paymentTermDays: input.paymentTermDays } : item) }));
      return { ok: true, message: "Restoran berhasil diperbarui" };
    },
    toggleRestaurantStatus: (id) => {
      const restaurant = getState().restaurants.find((item) => item.id === id);
      if (!restaurant) return { ok: false, message: "Restoran tidak ditemukan" };
      setState((state) => ({ ...state, restaurants: state.restaurants.map((item) => item.id === id ? { ...item, status: item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } : item) }));
      return { ok: true, message: restaurant.status === "ACTIVE" ? "Restoran dinonaktifkan" : "Restoran diaktifkan" };
    },
    deleteRestaurant: (id) => {
      const state = getState();
      if (!state.restaurants.some((item) => item.id === id)) return { ok: false, message: "Restoran tidak ditemukan" };
      if (state.invoices.some((invoice) => invoice.restaurantId === id)) return { ok: false, message: "Restoran sudah punya invoice. Nonaktifkan restoran agar riwayat tetap utuh." };
      setState((current) => ({ ...current, restaurants: current.restaurants.filter((item) => item.id !== id), customerPrices: current.customerPrices.filter((item) => item.restaurantId !== id) }));
      return { ok: true, message: "Restoran berhasil dihapus" };
    },
    receiveStock: (input) => {
      const items: ReceiptItem[] = input.items ?? (input.productId ? [{ productId: input.productId, manualQuantity: input.manualWeight ?? 0, digitalQuantity: input.digitalWeight ?? 0, unitCost: input.unitPurchasePrice ?? 0 }] : []);
      const itemError = validateReceiptItems(items);
      if (itemError) return { ok: false, message: itemError };
      const subtotal = receiptSubtotal(items);
      if (!Number.isFinite(input.paidAmount) || input.paidAmount < 0 || input.paidAmount > subtotal) return { ok: false, message: "Pembayaran supplier harus antara 0 dan total penerimaan" };
      if (input.dueDate && input.dueDate < input.date) return { ok: false, message: "Jatuh tempo tidak boleh sebelum tanggal penerimaan" };
      const state = getState();
      if (!state.suppliers.some((supplier) => supplier.id === input.supplierId)) return { ok: false, message: "Supplier belum dipilih" };
      if (items.some((item) => !state.products.some((product) => product.id === item.productId))) return { ok: false, message: "Produk belum dipilih" };
      const id = makeId("receipt");
      setState((current) => {
        const reserved = reserveDocumentNumber(current, `RCV/${input.date.slice(0, 7).replace("-", "/")}/`, 4);
        const movements: StockMovement[] = [];
        let products = current.products;
        for (const item of items) {
          const product = products.find((entry) => entry.id === item.productId)!;
          const stockBalance = product.stockBalance + item.digitalQuantity;
          const averageHpp = Math.round(calculateReceiptWeightedAverageCost(product.stockBalance, product.averageHpp, item.manualQuantity, item.digitalQuantity, item.unitCost));
          products = products.map((entry) => entry.id === product.id ? { ...entry, stockBalance, averageHpp, latestPurchaseCost: item.unitCost } : entry);
          movements.push(movement(input.date, product.id, "PURCHASE_IN", item.digitalQuantity, stockBalance, item.unitCost, reserved.number, input.notes?.trim() ?? ""));
        }
        return {
          ...current,
          numberSequences: reserved.numberSequences,
          products,
          stockMovements: [...current.stockMovements, ...movements],
          receipts: [...current.receipts, { id, receiptNumber: reserved.number, supplierId: input.supplierId, date: input.date, items, subtotal, status: "POSTED", supplierReference: (input.supplierReference ?? "").trim(), dueDate: input.dueDate ?? "", notes: (input.notes ?? "").trim(), paidAmount: input.paidAmount }],
        };
      });
      return { ok: true, id, message: "Stock berhasil diterima dan HPP diperbarui" };
    },
    cancelStockReceipt: (id, reason) => {
      const state = getState();
      const receipt = state.receipts.find((item) => item.id === id);
      if (!receipt) return { ok: false, message: "Penerimaan stok tidak ditemukan" };
      if (receipt.status === "CANCELLED") return { ok: false, message: "Penerimaan ini sudah dibatalkan" };
      if (!reason.trim()) return { ok: false, message: "Alasan pembatalan wajib diisi" };
      const short = receipt.items.find((item) => (state.products.find((product) => product.id === item.productId)?.stockBalance ?? 0) + 1e-9 < item.digitalQuantity);
      if (short) return { ok: false, message: "Stok produk sudah terpakai sebagian; penerimaan tidak bisa dibatalkan. Gunakan penyesuaian stok." };
      setState((current) => {
        const movements: StockMovement[] = [];
        let products = current.products;
        for (const item of receipt.items) {
          const product = products.find((entry) => entry.id === item.productId)!;
          const stockBalance = Number((product.stockBalance - item.digitalQuantity).toFixed(9));
          const value = product.stockBalance * product.averageHpp - item.manualQuantity * item.unitCost;
          const averageHpp = stockBalance > 0 ? Math.max(0, Math.round(value / stockBalance)) : product.averageHpp;
          products = products.map((entry) => entry.id === product.id ? { ...entry, stockBalance, averageHpp } : entry);
          movements.push(movement(today(), product.id, "RECEIPT_CANCEL_OUT", -item.digitalQuantity, stockBalance, item.unitCost, receipt.receiptNumber, reason.trim()));
        }
        return { ...current, products, stockMovements: [...current.stockMovements, ...movements], receipts: current.receipts.map((item) => item.id === id ? { ...item, status: "CANCELLED", cancelReason: reason.trim() } : item) };
      });
      return { ok: true, message: "Penerimaan dibatalkan dan stok dikurangi kembali" };
    },
    paySupplierReceipt: (input) => {
      const receipt = getState().receipts.find((item) => item.id === input.receiptId);
      if (!receipt) return { ok: false, message: "Tagihan supplier tidak ditemukan" };
      if (receipt.status === "CANCELLED") return { ok: false, message: "Penerimaan sudah dibatalkan" };
      if (receipt.paidAmount === undefined) return { ok: false, message: "Status pembayaran data lama belum diverifikasi. Verifikasi jumlah yang sudah dibayar lebih dulu." };
      if (!isBusinessDate(input.date) || input.date < receipt.date) return { ok: false, message: "Tanggal pembayaran tidak boleh sebelum tanggal penerimaan" };
      if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || !["Transfer", "Tunai"].includes(input.method)) return { ok: false, message: "Nominal harus Rupiah utuh lebih dari 0 dan metode wajib dipilih" };
      if (receipt.paidAmount + input.amount > receipt.subtotal) return { ok: false, message: "Pembayaran melebihi sisa utang supplier" };
      const id = makeId("supplier-payment");
      setState((state) => ({
        ...state,
        receipts: state.receipts.map((item) => item.id === receipt.id ? { ...item, paidAmount: (item.paidAmount ?? 0) + input.amount } : item),
        supplierPayments: [...state.supplierPayments, { id, receiptId: receipt.id, date: input.date, amount: input.amount, method: input.method, reference: input.reference.trim() }],
      }));
      return { ok: true, id, message: "Pembayaran supplier dicatat" };
    },
    verifyReceiptPayment: (id, paidAmount) => {
      const receipt = getState().receipts.find((item) => item.id === id);
      if (!receipt) return { ok: false, message: "Penerimaan tidak ditemukan" };
      if (!Number.isSafeInteger(paidAmount) || paidAmount < 0 || paidAmount > receipt.subtotal) return { ok: false, message: "Jumlah dibayar harus antara 0 dan total penerimaan" };
      setState((state) => ({ ...state, receipts: state.receipts.map((item) => item.id === id ? { ...item, paidAmount } : item) }));
      return { ok: true, message: "Status pembayaran diverifikasi" };
    },
    createInvoice: (input) => {
      const currentState = getState();
      const calculated = calculateInvoice(currentState, input);
      if (!calculated.ok) return { ok: false, message: Object.values(calculated.errors)[0] };
      const id = makeId("invoice");
      setState((state) => {
        const reserved = reserveDocumentNumber(state, `INV/${input.date.slice(0, 7).replace("-", "/")}/`, 4);
        const invoice: BusinessState["invoices"][number] = { id, revision: 1, invoiceNumber: reserved.number, salesChannel: input.channel, restaurantId: input.channel === "RESTAURANT" ? input.restaurantId : undefined, customerName: input.customerName.trim(), date: input.date, dueDate: input.dueDate, status: calculated.status, items: calculated.items, directCosts: calculated.directCosts, subtotal: calculated.subtotal, discount: input.discount, total: calculated.total, paidAmount: 0, outstandingAmount: calculated.total };
        return audit({ ...state, numberSequences: reserved.numberSequences, products: calculated.products, stockMovements: [...state.stockMovements, ...invoiceMovements(state.products, calculated.products, input.date, reserved.number)], invoices: [...state.invoices, invoice] }, "INVOICE_CREATED", "Invoice", reserved.number);
      });
      return { ok: true, id, message: "Invoice dibuat dan stok diperbarui" };
    },
    updateInvoice: (id, input) => {
      const state = getState();
      const previous = state.invoices.find((item) => item.id === id);
      if (!previous) return { ok: false, message: "Invoice tidak ditemukan" };
      if (input.expectedRevision !== undefined && input.expectedRevision !== (previous.revision ?? 0)) return { ok: false, message: "Invoice berubah sejak form dibuka. Buka ulang agar koreksi tidak menimpa data terbaru." };
      if (state.payments.some((payment) => payment.invoiceId === id && payment.date < input.date)) return { ok: false, message: "Tanggal invoice tidak boleh setelah pembayaran yang sudah dicatat" };
      const calculated = calculateInvoice(state, input, previous);
      if (!calculated.ok) return { ok: false, message: Object.values(calculated.errors)[0] };
      setState((current) => audit({ ...current, products: calculated.products, stockMovements: [...current.stockMovements, ...invoiceMovements(current.products, calculated.products, input.date, previous.invoiceNumber)], invoices: current.invoices.map((item) => item.id !== id ? item : { ...item, revision: (item.revision ?? 0) + 1, salesChannel: input.channel, restaurantId: input.channel === "RESTAURANT" ? input.restaurantId : undefined, customerName: input.customerName.trim(), date: input.date, dueDate: input.dueDate, items: item.items.length === 0 ? item.items : calculated.items, directCosts: calculated.directCosts, subtotal: calculated.subtotal, discount: input.discount, total: calculated.total, paidAmount: calculated.paidAmount, outstandingAmount: calculated.outstandingAmount, status: calculated.status }) }, "INVOICE_UPDATED", "Invoice", previous.invoiceNumber));
      return { ok: true, id, message: "Invoice diperbarui; stok dan piutang sudah disesuaikan" };
    },
    deleteInvoice: (id, options = {}) => {
      const state = getState();
      const invoice = state.invoices.find((item) => item.id === id);
      if (!invoice) return { ok: false, message: "Invoice tidak ditemukan" };
      if (options.expectedRevision !== undefined && options.expectedRevision !== (invoice.revision ?? 0)) return { ok: false, message: "Invoice berubah. Periksa ulang dampak penghapusan." };
      if ((invoice.paidAmount > 0 || state.payments.some((item) => item.invoiceId === id)) && !options.deletePayments) return { ok: false, message: "Invoice memiliki pembayaran. Persetujuan penghapusan pembayaran wajib diberikan." };
      if (!invoice.items.length && !options.acknowledgeMissingItems) return { ok: false, message: "Rincian produk invoice lama tidak tersedia. Konfirmasi bahwa stok tidak dapat dikembalikan otomatis." };
      if (invoice.items.some((item) => !state.products.some((product) => product.id === item.productId))) return { ok: false, message: "Produk invoice tidak ditemukan; stok belum bisa dipulihkan dengan aman." };
      setState((state) => {
        const restored = restoreInvoiceStock(state, invoice);
        return audit({ ...state, products: restored, stockMovements: [...state.stockMovements, ...invoiceMovements(state.products, restored, today(), invoice.invoiceNumber)], invoices: state.invoices.filter((item) => item.id !== id), payments: state.payments.filter((item) => item.invoiceId !== id) }, "INVOICE_DELETED", "Invoice", invoice.invoiceNumber);
      });
      return { ok: true, message: invoice.items.length ? "Invoice dihapus dan stok dikembalikan" : "Invoice lama dihapus tanpa perubahan stok" };
    },
    addPayment: (input) => changePayment(undefined, input),
    updatePayment: (id, input) => changePayment(id, input, input.expectedRevision),
    deletePayment: (id, expectedRevision) => changePayment(id, null, expectedRevision),
    addOperatingExpense: (input) => {
      if (!input.category.trim() || !input.description.trim() || input.amount <= 0) return { ok: false, message: "Kategori, deskripsi, dan jumlah wajib diisi" };
      setState((state) => ({ ...state, operatingExpenses: [...state.operatingExpenses, { id: makeId("erp-expense"), ...input, category: input.category.trim(), description: input.description.trim() }] }));
      return { ok: true, message: "Pengeluaran Resto & Online berhasil dicatat" };
    },
    updateOperatingExpense: (id, input) => {
      if (!getState().operatingExpenses.some((item) => item.id === id)) return { ok: false, message: "Pengeluaran tidak ditemukan" };
      if (!input.category.trim() || !input.description.trim() || input.amount <= 0) return { ok: false, message: "Kategori, deskripsi, dan jumlah wajib diisi" };
      setState((state) => ({ ...state, operatingExpenses: state.operatingExpenses.map((item) => item.id === id ? { ...item, ...input, category: input.category.trim(), description: input.description.trim() } : item) }));
      return { ok: true, message: "Pengeluaran berhasil diperbarui" };
    },
    deleteOperatingExpense: (id) => {
      if (!getState().operatingExpenses.some((item) => item.id === id)) return { ok: false, message: "Pengeluaran tidak ditemukan" };
      setState((state) => ({ ...state, operatingExpenses: state.operatingExpenses.filter((item) => item.id !== id) }));
      return { ok: true, message: "Pengeluaran berhasil dihapus" };
    },
    addNote: (input) => {
      if (!input.title.trim() || !input.content.trim()) return { ok: false, message: "Judul dan isi catatan wajib diisi" };
      setState((state) => ({ ...state, notes: [...state.notes, { id: makeId("note"), title: input.title.trim(), content: input.content.trim(), createdAt: new Date().toISOString() }] }));
      return { ok: true, message: "Catatan berhasil disimpan" };
    },
    updateCompany: (input) => {
      const clean = (value: string) => String(value ?? "").trim();
      const next: CompanyProfile = { name: clean(input.name), address: clean(input.address), phone: clean(input.phone), email: clean(input.email), website: clean(input.website), npwp: clean(input.npwp), bankName: clean(input.bankName), bankAccount: clean(input.bankAccount), bankHolder: clean(input.bankHolder) };
      if (!next.name) return { ok: false, message: "Nama bisnis wajib diisi" };
      if (next.email && !/^\S+@\S+\.\S+$/.test(next.email)) return { ok: false, message: "Format email bisnis tidak valid" };
      if (next.bankAccount && !/^[0-9 .-]+$/.test(next.bankAccount)) return { ok: false, message: "Nomor rekening hanya boleh berisi angka" };
      setState((state) => audit({ ...state, company: next }, "COMPANY_UPDATED", "Profil bisnis", next.name));
      return { ok: true, message: "Profil bisnis berhasil diperbarui" };
    },
    addUser: (input) => {
      const name = input.name.trim();
      const email = input.email.trim().toLowerCase();
      if (!name) return { ok: false, message: "Nama pengguna wajib diisi" };
      if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, message: "Email pengguna tidak valid" };
      if (!USER_ROLES.includes(input.role)) return { ok: false, message: "Pilih peran pengguna" };
      if (getState().users.some((user) => user.email.toLowerCase() === email)) return { ok: false, message: "Email sudah dipakai pengguna lain" };
      const id = makeId("user");
      setState((state) => audit({ ...state, users: [...state.users, { id, name, email, role: input.role, status: "ACTIVE", createdAt: new Date().toISOString() }] }, "USER_ADDED", "Pengguna", name));
      return { ok: true, id, message: "Pengguna berhasil ditambahkan" };
    },
    updateUser: (id, input) => {
      const state = getState();
      const user = state.users.find((item) => item.id === id);
      if (!user) return { ok: false, message: "Pengguna tidak ditemukan" };
      const name = input.name.trim();
      const email = input.email.trim().toLowerCase();
      if (!name) return { ok: false, message: "Nama pengguna wajib diisi" };
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return { ok: false, message: "Email pengguna tidak valid" };
      if (!USER_ROLES.includes(input.role)) return { ok: false, message: "Pilih peran pengguna" };
      if (email && state.users.some((item) => item.id !== id && item.email.toLowerCase() === email)) return { ok: false, message: "Email sudah dipakai pengguna lain" };
      if (user.role === "OWNER" && input.role !== "OWNER" && !state.users.some((item) => item.id !== id && item.role === "OWNER" && item.status === "ACTIVE")) return { ok: false, message: "Harus ada minimal satu Owner aktif" };
      setState((current) => audit({ ...current, users: current.users.map((item) => item.id === id ? { ...item, name, email, role: input.role } : item) }, "USER_UPDATED", "Pengguna", name));
      return { ok: true, message: "Pengguna berhasil diperbarui" };
    },
    toggleUserStatus: (id) => {
      const state = getState();
      const user = state.users.find((item) => item.id === id);
      if (!user) return { ok: false, message: "Pengguna tidak ditemukan" };
      if (user.status === "ACTIVE" && user.role === "OWNER" && !state.users.some((item) => item.id !== id && item.role === "OWNER" && item.status === "ACTIVE")) return { ok: false, message: "Owner aktif terakhir tidak bisa dinonaktifkan" };
      setState((current) => audit({ ...current, users: current.users.map((item) => item.id === id ? { ...item, status: item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } : item) }, user.status === "ACTIVE" ? "USER_DEACTIVATED" : "USER_ACTIVATED", "Pengguna", user.name));
      return { ok: true, message: user.status === "ACTIVE" ? "Pengguna dinonaktifkan" : "Pengguna diaktifkan" };
    },
  };
  // All mutations use the same date/number guards and report persistence failures to the form.
  return Object.fromEntries(Object.entries(commands).map(([name, command]) => [name, (...args: unknown[]): CommandResult => {
    for (const argument of args) {
      if (!argument || typeof argument !== "object") continue;
      // Payment slots carry their own validation: an empty date clears/keeps a slot empty, so it is not rejected here.
      const allowsEmptyDate = "paymentNumber" in argument || "slot" in argument || "amount" in argument;
      for (const [field, value] of Object.entries(argument)) {
        const emptyPaymentDate = field === "date" && allowsEmptyDate && value === "";
        if ((field === "date" || field === "startDate") && !emptyPaymentDate && (typeof value !== "string" || !isBusinessDate(value))) return { ok: false, message: "Tanggal wajib valid (YYYY-MM-DD)" };
        if (typeof value === "number" && !Number.isFinite(value)) return { ok: false, message: "Jumlah dan harga harus berupa angka yang valid" };
      }
    }
    try {
      return (command as (...input: unknown[]) => CommandResult)(...args);
    } catch (error) {
      if (error instanceof BusinessPersistenceError) return { ok: false, message: error.message };
      throw error;
    }
  }])) as BusinessCommands;
}
