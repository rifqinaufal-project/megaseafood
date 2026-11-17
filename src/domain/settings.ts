import type {
  AppUser,
  AuditLog,
  BusinessState,
  DirectCostCategory,
  UserRole,
} from "@/src/domain/business-state";

export const DIRECT_COST_CATEGORIES: DirectCostCategory[] = [
  "PACKAGING",
  "ICE",
  "SHIPPING",
  "FUEL",
  "TOLL",
  "PARKING",
  "COURIER",
  "PRODUCT_LOSS",
  "OTHER",
];

const directCostLabels: Record<DirectCostCategory, string> = {
  PACKAGING: "Packaging",
  ICE: "Es",
  SHIPPING: "Pengiriman",
  FUEL: "Bensin",
  TOLL: "Tol",
  PARKING: "Parkir",
  COURIER: "Kurir",
  PRODUCT_LOSS: "Penyusutan",
  OTHER: "Lainnya",
};
export const directCostLabel = (category: DirectCostCategory) =>
  directCostLabels[category] ?? category;

export const USER_ROLES: UserRole[] = ["OWNER", "FINANCE", "STAFF"];
export const userRoleLabels: Record<UserRole, string> = {
  OWNER: "Owner (akses penuh)",
  FINANCE: "Admin & Keuangan",
  STAFF: "Staff Operasional",
};

export const BANK_OPTIONS = [
  "BCA",
  "Bank Mandiri",
  "BNI",
  "BRI",
  "Bank Permata",
  "CIMB Niaga",
  "Bank Danamon",
  "BSI",
  "BTN",
  "Panin Bank",
  "Bank Mega",
  "Maybank Indonesia",
];

export const auditActionLabels: Record<string, string> = {
  INVOICE_CREATED: "Invoice dibuat",
  INVOICE_UPDATED: "Invoice diperbarui",
  INVOICE_DELETED: "Invoice dihapus",
  PAYMENT_RECORDED: "Pembayaran dicatat",
  PAYMENT_UPDATED: "Pembayaran diperbarui",
  PAYMENT_DELETED: "Pembayaran dihapus",
  PRODUCT_COST_CHANGED: "HPP diubah",
  CUSTOMER_PRICE_CHANGED: "Harga pelanggan diubah",
  COMPANY_UPDATED: "Profil bisnis diubah",
  USER_ADDED: "Pengguna ditambahkan",
  USER_UPDATED: "Pengguna diubah",
  USER_ACTIVATED: "Pengguna diaktifkan",
  USER_DEACTIVATED: "Pengguna dinonaktifkan",
};

const MAX_AUDIT_LOGS = 500;

/** Aplikasi belum memakai login, jadi pengguna aktif adalah owner aktif pertama. */
export const currentUser = (state: Pick<BusinessState, "users">): AppUser | undefined =>
  state.users.find((user) => user.role === "OWNER" && user.status === "ACTIVE") ??
  state.users.find((user) => user.status === "ACTIVE");

export function appendAuditLog(
  state: BusinessState,
  action: string,
  entityName: string,
  reference: string,
  id: string,
  actor?: string,
  createdAt = new Date().toISOString(),
): BusinessState {
  const log: AuditLog = {
    id,
    createdAt,
    userName: actor?.trim() || currentUser(state)?.name || "Sistem",
    action,
    entityName,
    reference,
  };
  return { ...state, auditLogs: [...state.auditLogs, log].slice(-MAX_AUDIT_LOGS) };
}
