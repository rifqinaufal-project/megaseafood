import type { BusinessState, Invoice } from "@/src/domain/business-state";

/** Hanya informasi yang memang boleh dilihat penerima invoice. */
export function publicInvoice(invoice: Invoice, company: BusinessState["company"], products: BusinessState["products"]) {
  return {
    invoiceNumber: invoice.invoiceNumber, customerName: invoice.customerName,
    date: invoice.date, dueDate: invoice.dueDate, status: invoice.status,
    items: invoice.items.map((item) => ({
      name: item.productName || products.find((product) => product.id === item.productId)?.name || "Produk",
      unit: item.unit, quantity: item.billingQuantity, price: item.sellingPrice, subtotal: item.subtotal,
    })),
    subtotal: invoice.subtotal, discount: invoice.discount, total: invoice.total,
    paidAmount: invoice.paidAmount, outstandingAmount: invoice.outstandingAmount,
    company: { name: company.name, address: company.address, phone: company.phone, email: company.email,
      bankName: company.bankName, bankAccount: company.bankAccount, bankHolder: company.bankHolder },
  };
}
