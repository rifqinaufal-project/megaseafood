import { localDate } from "@/src/domain/business-integrity";

export type RecordStatus = "ACTIVE" | "INACTIVE";
export type SalesChannel = "RESTAURANT" | "ONLINE";

export interface Batch {
  id: string;
  batchNumber: string;
  startDate: string;
  notes: string;
}

export interface Commission {
  id: string;
  batchId: string;
  date: string;
  partner: string;
  amount: number;
  note: string;
}

export interface Sourcing {
  id: string;
  batchId: string;
  date: string;
  sourceType: "SUPPLIER" | "BENGKELAN";
  sourceName: string;
  productName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  paidAmount: number;
  outstandingAmount: number;
  note: string;
}

export interface LapakSaleItem {
  productName: string;
  quantity: number;
  unit: string;
  sellingPrice: number;
  unitCost: number;
  subtotal: number;
  costTotal: number;
  profit: number;
}

export interface LapakSale {
  id: string;
  batchId: string;
  date: string;
  customerLabel: string;
  items: LapakSaleItem[];
  totalAmount: number;
  paymentStatus: "PAID";
}

export interface LapakExpense {
  id: string;
  batchId: string;
  date: string;
  expenseName: string;
  amount: number;
  notes: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  size: string;
  unit: string;
  defaultSellingPrice: number;
  averageHpp: number;
  latestPurchaseCost: number;
  stockBalance: number;
  minimumStock: number;
  status: RecordStatus;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  status: RecordStatus;
}

export interface Restaurant {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  paymentTermDays: number;
  status: RecordStatus;
}

export type StockMovementType =
  | "PURCHASE_IN"
  | "SALE_OUT"
  | "INVOICE_VOID_RETURN"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "RECEIPT_CANCEL_OUT"
  | "COST_ADJUSTMENT";

export interface StockMovement {
  id: string;
  date: string;
  productId: string;
  type: StockMovementType;
  quantity: number;
  balanceAfter: number;
  unitCost: number;
  reference: string;
  notes: string;
}

export interface CustomerPrice {
  id: string;
  restaurantId: string;
  productId: string;
  sellingPrice: number;
  date: string;
}

export interface ReceiptItem {
  productId: string;
  /** Berat yang menjadi dasar pembayaran ke supplier (timbangan manual/pasar). */
  manualQuantity: number;
  /** Berat aktual yang masuk ke gudang (timbangan digital). */
  digitalQuantity: number;
  unitCost: number;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  supplierId: string;
  date: string;
  items: ReceiptItem[];
  subtotal: number;
  status: "POSTED" | "CANCELLED";
  supplierReference: string;
  dueDate: string;
  notes: string;
  cancelReason?: string;
  // Absent on legacy receipts: payment status is unknown, not automatically unpaid.
  paidAmount?: number;
}

export interface SupplierPayment {
  id: string;
  receiptId: string;
  date: string;
  amount: number;
  method: string;
  reference: string;
}

export interface InvoiceItem {
  productId: string;
  productName?: string;
  unit?: string;
  stockQuantity: number;
  marginQuantity: number;
  billingQuantity: number;
  sellingPrice: number;
  hpp: number;
  subtotal: number;
  hppTotal: number;
  profit: number;
}

export type DirectCostCategory =
  | "PACKAGING"
  | "ICE"
  | "SHIPPING"
  | "FUEL"
  | "TOLL"
  | "PARKING"
  | "COURIER"
  | "PRODUCT_LOSS"
  | "OTHER";

export interface InvoiceDirectCost {
  id: string;
  category: DirectCostCategory;
  name: string;
  amount: number;
}

export interface Invoice {
  id: string;
  revision?: number;
  invoiceNumber: string;
  salesChannel: SalesChannel;
  restaurantId?: string;
  customerName: string;
  date: string;
  dueDate: string;
  status: "ISSUED" | "PARTIALLY_PAID" | "PAID";
  items: InvoiceItem[];
  /** Biaya internal per transaksi; absen pada invoice yang dibuat sebelum fitur ini ada. */
  directCosts?: InvoiceDirectCost[];
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  outstandingAmount: number;
}

export interface Payment {
  id: string;
  revision?: number;
  invoiceId: string;
  date: string;
  amount: number;
  method: string;
  reference: string;
}

export interface OperatingExpense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
}

export interface PrivateNote {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface CompanyProfile {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  npwp: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
}

export type UserRole = "OWNER" | "FINANCE" | "STAFF";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: RecordStatus;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  createdAt: string;
  userName: string;
  action: string;
  entityName: string;
  reference: string;
}

export interface BusinessState {
  numberSequences?: Record<string, number>;
  company: CompanyProfile;
  users: AppUser[];
  auditLogs: AuditLog[];
  batches: Batch[];
  commissions: Commission[];
  sourcings: Sourcing[];
  lapakSales: LapakSale[];
  lapakExpenses: LapakExpense[];
  products: Product[];
  suppliers: Supplier[];
  restaurants: Restaurant[];
  receipts: Receipt[];
  supplierPayments: SupplierPayment[];
  stockMovements: StockMovement[];
  customerPrices: CustomerPrice[];
  invoices: Invoice[];
  payments: Payment[];
  operatingExpenses: OperatingExpense[];
  notes: PrivateNote[];
}

export const today = () => localDate();

export const makeId = (prefix: string) => {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
};

export const numberValue = (value: string | number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatRupiah = (value: string | number) => {
  if (typeof value === "string") {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    return Number(digits).toLocaleString("id-ID");
  }
  return Number.isFinite(value) ? Math.round(value).toLocaleString("id-ID") : "";
};

export const defaultCompanyProfile = (): CompanyProfile => ({
  name: "megaseafood",
  address: "",
  phone: "",
  email: "",
  website: "",
  npwp: "",
  bankName: "BCA",
  bankAccount: "",
  bankHolder: "",
});

export const defaultOwnerUser = (): AppUser => ({
  id: "user-owner",
  name: "Pemilik",
  email: "",
  role: "OWNER",
  status: "ACTIVE",
  createdAt: "2026-06-01T00:00:00.000Z",
});

export const seedBusinessState = (): BusinessState => ({
  company: defaultCompanyProfile(),
  users: [defaultOwnerUser()],
  auditLogs: [],
  batches: [
    { id: "batch-42", batchNumber: "BAT-100626-001", startDate: "2026-06-10", notes: "Batch Pasar Muara Baru" },
    { id: "batch-41", batchNumber: "BAT-080626-001", startDate: "2026-06-08", notes: "Batch supplier reguler" },
    { id: "batch-40", batchNumber: "BAT-060626-001", startDate: "2026-06-06", notes: "Batch bengkelan Muara" },
  ],
  commissions: [
    { id: "commission-1", batchId: "batch-42", date: "2026-06-12", partner: "Pak Rahmat", amount: 4200000, note: "Komisi supplier" },
    { id: "commission-2", batchId: "batch-41", date: "2026-06-11", partner: "Bu Sari Seafood", amount: 2750000, note: "Komisi tetap" },
  ],
  sourcings: [
    { id: "sourcing-1", batchId: "batch-42", date: "2026-06-12", sourceType: "SUPPLIER", sourceName: "CV Laut Jaya", productName: "Udang Vaname", quantity: 48, unit: "kg", unitCost: 72000, totalCost: 3456000, paidAmount: 2500000, outstandingAmount: 956000, note: "" },
  ],
  lapakSales: [],
  lapakExpenses: [
    { id: "lapak-expense-1", batchId: "batch-42", date: "2026-06-12", expenseName: "Es", amount: 420000, notes: "Es balok" },
  ],
  products: [
    { id: "product-1", sku: "UDG-3140", name: "Udang Vaname 31/40", category: "Udang", size: "31/40", unit: "kg", defaultSellingPrice: 86000, averageHpp: 72000, latestPurchaseCost: 72000, stockBalance: 8, minimumStock: 15, status: "ACTIVE" },
    { id: "product-2", sku: "KER-001", name: "Kerang Hijau", category: "Kerang", size: "", unit: "kg", defaultSellingPrice: 32000, averageHpp: 24000, latestPurchaseCost: 24000, stockBalance: 4, minimumStock: 10, status: "ACTIVE" },
    { id: "product-3", sku: "CUM-001", name: "Cumi Ring", category: "Cumi", size: "Ring", unit: "kg", defaultSellingPrice: 74000, averageHpp: 58000, latestPurchaseCost: 58000, stockBalance: 6, minimumStock: 10, status: "ACTIVE" },
  ],
  suppliers: [
    { id: "supplier-1", name: "CV Laut Jaya", contactName: "Budi", phone: "081299008811", email: "", address: "Muara Baru, Jakarta Utara", status: "ACTIVE" },
    { id: "supplier-2", name: "PT Segara Fresh", contactName: "Nadia", phone: "081132121000", email: "", address: "Pelabuhan Ratu, Sukabumi", status: "ACTIVE" },
  ],
  restaurants: [
    { id: "restaurant-1", name: "Dapoer Ikan", contactName: "Budi", phone: "081233445566", email: "", address: "", notes: "", paymentTermDays: 14, status: "ACTIVE" },
    { id: "restaurant-2", name: "Laut Rasa", contactName: "Nadia", phone: "081320118090", email: "", address: "", notes: "", paymentTermDays: 7, status: "ACTIVE" },
  ],
  receipts: [],
  supplierPayments: [],
  stockMovements: [],
  customerPrices: [],
  invoices: [
    { id: "invoice-128", invoiceNumber: "INV/2026/06/0128", salesChannel: "RESTAURANT", restaurantId: "restaurant-1", customerName: "Dapoer Ikan", date: "2026-06-12", dueDate: "2026-06-26", status: "PAID", items: [], subtotal: 8750000, discount: 0, total: 8750000, paidAmount: 8750000, outstandingAmount: 0 },
    { id: "invoice-127", invoiceNumber: "INV/2026/06/0127", salesChannel: "RESTAURANT", restaurantId: "restaurant-2", customerName: "Laut Rasa", date: "2026-06-11", dueDate: "2026-06-18", status: "ISSUED", items: [], subtotal: 6420000, discount: 0, total: 6420000, paidAmount: 0, outstandingAmount: 6420000 },
  ],
  payments: [],
  operatingExpenses: [
    { id: "erp-expense-1", date: "2026-06-12", category: "Logistik", description: "Bensin kendaraan operasional", amount: 740000 },
  ],
  notes: [],
});
