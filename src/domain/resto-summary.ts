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
