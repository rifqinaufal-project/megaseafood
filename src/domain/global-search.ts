import { formatRupiah, type BusinessState } from "@/src/domain/business-state";
import type { Module } from "@/src/domain/dashboard";

export type GlobalSearchResult = {
  kind: string;
  title: string;
  detail: string;
  module: Module;
  page: string;
  invoiceId?: string;
  batchId?: string;
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("id-ID");

/** Pencarian lintas data bisnis. Hanya teks dan referensi yang dibutuhkan UI yang dikembalikan. */
export function searchBusiness(state: BusinessState, query: string, limit = 18): GlobalSearchResult[] {
  const term = normalize(query.trim());
  if (!term) return [];
  const results: GlobalSearchResult[] = [];
  const add = (result: GlobalSearchResult, fields: (string | number | undefined)[]) => {
    if ([result.kind, result.title, result.detail, ...fields].some((field) => field !== undefined && normalize(String(field)).includes(term))) results.push(result);
  };

  for (const invoice of state.invoices) add({
    kind: "Invoice", title: invoice.invoiceNumber, detail: `${invoice.customerName} · ${invoice.date} · Rp ${formatRupiah(invoice.total)}`,
    module: "resto", page: "Invoice", invoiceId: invoice.id,
  }, [invoice.invoiceNumber, invoice.customerName, invoice.date, ...invoice.items.map((item) => item.productName)]);

  for (const product of state.products) add({
    kind: "Produk", title: product.name, detail: `${product.sku} · ${product.category} · Stok ${product.stockBalance} ${product.unit}`,
    module: "resto", page: "Stok",
  }, [product.name, product.sku, product.category, product.size]);

  for (const restaurant of state.restaurants) add({
    kind: "Restoran", title: restaurant.name, detail: [restaurant.contactName, restaurant.phone].filter(Boolean).join(" · "),
    module: "resto", page: "Restoran",
  }, [restaurant.name, restaurant.contactName, restaurant.phone, restaurant.email]);

  for (const supplier of state.suppliers) add({
    kind: "Supplier", title: supplier.name, detail: [supplier.contactName, supplier.phone].filter(Boolean).join(" · "),
    module: "resto", page: "Supplier",
  }, [supplier.name, supplier.contactName, supplier.phone, supplier.email]);

  for (const batch of state.batches) add({
    kind: "Batch", title: batch.batchNumber, detail: [batch.startDate, batch.notes].filter(Boolean).join(" · "),
    module: "lapak", page: "Batch", batchId: batch.id,
  }, [batch.batchNumber, batch.startDate, batch.notes]);

  for (const commission of state.commissions) add({
    kind: "Komisi", title: commission.partner, detail: `${commission.date} · Rp ${formatRupiah(commission.amount)}${commission.note ? ` · ${commission.note}` : ""}`,
    module: "lapak", page: "Komisi", batchId: commission.batchId,
  }, [commission.partner, commission.date, commission.note, commission.id]);

  for (const sourcing of state.sourcings) add({
    kind: sourcing.sourceType === "BENGKELAN" ? "Bengkelan" : "Pengadaan", title: sourcing.name, detail: `${sourcing.type} · ${sourcing.date} · Rp ${formatRupiah(sourcing.total)}`,
    module: "lapak", page: "Pengadaan",
  }, [sourcing.name, sourcing.type, sourcing.sourceType, sourcing.date, sourcing.note, sourcing.id, sourcing.sequence]);

  for (const row of state.lapakSales) {
    const kindLabel = row.kind === "KREDIT" ? "Kredit" : "Debit";
    add({
      kind: "Buku Tagihan", title: row.customerName || "—", detail: `${row.date} · ${kindLabel} Rp ${formatRupiah(row.amount)}${row.note ? ` · ${row.note}` : ""}`,
      module: "lapak", page: "Penjualan",
    }, [row.customerName, row.date, row.id, row.note, kindLabel]);
  }

  for (const expense of state.lapakExpenses) add({
    kind: "Pengeluaran Lapak", title: expense.expenseName, detail: `${expense.date} · Rp ${formatRupiah(expense.amount)}${expense.notes ? ` · ${expense.notes}` : ""}`,
    module: "lapak", page: "Pengeluaran", batchId: expense.batchId,
  }, [expense.expenseName, expense.notes, expense.date, expense.id]);

  for (const expense of state.operatingExpenses) add({
    kind: "Pengeluaran Resto", title: expense.description, detail: `${expense.category} · ${expense.date} · Rp ${formatRupiah(expense.amount)}`,
    module: "resto", page: "Pengeluaran",
  }, [expense.description, expense.category, expense.date, expense.id]);

  for (const receipt of state.receipts) {
    const supplier = state.suppliers.find((item) => item.id === receipt.supplierId)?.name ?? "Supplier";
    const productNames = receipt.items.map((item) => state.products.find((product) => product.id === item.productId)?.name).filter(Boolean).join(", ");
    add({
      kind: "Penerimaan Stok", title: receipt.receiptNumber, detail: `${supplier} · ${receipt.date} · ${productNames}`,
      module: "resto", page: "Stok",
    }, [receipt.receiptNumber, receipt.supplierReference, receipt.date, receipt.notes, supplier, productNames]);
  }

  for (const payment of state.payments) {
    const invoice = state.invoices.find((item) => item.id === payment.invoiceId);
    add({
      kind: "Pembayaran Invoice", title: invoice?.invoiceNumber || payment.reference || "Pembayaran", detail: `${invoice?.customerName ?? "Invoice"} · ${payment.date} · Rp ${formatRupiah(payment.amount)} · ${payment.method}`,
      module: "resto", page: "Pembayaran",
    }, [payment.reference, payment.method, payment.date, invoice?.invoiceNumber, invoice?.customerName]);
  }

  for (const payment of state.supplierPayments) {
    const receipt = state.receipts.find((item) => item.id === payment.receiptId);
    add({
      kind: "Pembayaran Supplier", title: payment.reference || receipt?.receiptNumber || "Pembayaran supplier", detail: `${payment.date} · Rp ${formatRupiah(payment.amount)} · ${payment.method}`,
      module: "resto", page: "Utang",
    }, [payment.reference, payment.method, payment.date, receipt?.receiptNumber]);
  }

  for (const movement of state.stockMovements) {
    const product = state.products.find((item) => item.id === movement.productId)?.name ?? "Produk";
    add({
      kind: "Pergerakan Stok", title: product, detail: `${movement.date} · ${movement.reference} · ${movement.notes}`,
      module: "resto", page: "Stok",
    }, [product, movement.reference, movement.notes, movement.date, movement.id]);
  }

  for (const note of state.notes) add({
    kind: "Catatan", title: note.title, detail: note.content,
    module: "overview", page: "Aktivitas",
  }, [note.title, note.content]);

  const normalizedResults = results.map((result, index) => ({ result, index, title: normalize(result.title) }));
  normalizedResults.sort((a, b) => Number(!a.title.startsWith(term)) - Number(!b.title.startsWith(term)) || a.index - b.index);
  return normalizedResults.slice(0, Math.max(0, limit)).map(({ result }) => result);
}
