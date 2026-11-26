import type { Invoice, Product, Receipt } from "@/src/domain/business-state";
import { receiptOutstanding } from "@/src/domain/business-integrity";

export function stockValue(products: Pick<Product, "stockBalance" | "averageHpp">[]) {
  return products.reduce((sum, item) => sum + item.stockBalance * item.averageHpp, 0);
}

export function supplierPurchaseTotal(receipts: Pick<Receipt, "subtotal">[]) {
  return receipts.reduce((sum, item) => sum + item.subtotal, 0);
}

export function supplierDebtTotal(receipts: Receipt[]) {
  return receipts.reduce((sum, item) => sum + (receiptOutstanding(item) ?? 0), 0);
}

export function restaurantReceivable(invoices: Invoice[], restaurantId: string) {
  return invoices
    .filter((item) => item.restaurantId === restaurantId)
    .reduce((sum, item) => sum + item.outstandingAmount, 0);
}

export function restaurantReceivableTotal(invoices: Invoice[]) {
  return invoices
    .filter((item) => item.restaurantId)
    .reduce((sum, item) => sum + item.outstandingAmount, 0);
}

// Total nilai semua invoice, termasuk ONLINE. Dipakai sebagai angka pendapatan Resto & Online.
export function invoiceRevenueTotal(invoices: Pick<Invoice, "total">[]) {
  return invoices.reduce((sum, item) => sum + item.total, 0);
}

// Invoice yang masih punya sisa tagihan, termasuk ONLINE (tidak hanya restoran).
export function unpaidInvoices<T extends Pick<Invoice, "outstandingAmount">>(invoices: T[]) {
  return invoices.filter((item) => item.outstandingAmount > 0);
}

// Piutang total dari semua invoice yang belum lunas, termasuk ONLINE.
// Berbeda dari restaurantReceivableTotal, yang hanya menghitung invoice restoran.
export function unpaidInvoiceReceivable(invoices: Pick<Invoice, "outstandingAmount">[]) {
  return unpaidInvoices(invoices).reduce((sum, item) => sum + item.outstandingAmount, 0);
}
