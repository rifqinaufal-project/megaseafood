import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBusinessState, type Invoice } from "../src/domain/business-state";
import { publicInvoice } from "../src/domain/public-invoice";
import { invoiceWhatsappMessage } from "../src/presentation/dashboard/invoice-share";

test("public invoice contains customer amounts but excludes internal figures", () => {
  const state = emptyBusinessState();
  const invoice: Invoice = { id: "secret-id", invoiceNumber: "INV-1", salesChannel: "ONLINE", customerName: "Pelanggan", date: "2026-01-01", dueDate: "2026-01-03", status: "ISSUED", items: [{ productId: "p", productName: "Ikan", unit: "kg", stockQuantity: 1, marginQuantity: 9, billingQuantity: 1, sellingPrice: 100, hpp: 42, subtotal: 100, hppTotal: 42, profit: 58 }], directCosts: [{ id: "internal", category: "ICE", name: "Rahasia", amount: 5 }], subtotal: 100, discount: 0, total: 100, paidAmount: 0, outstandingAmount: 100 };
  const view = publicInvoice(invoice, state.company, state.products);
  assert.equal(view.items[0].name, "Ikan");
  assert.equal(view.total, 100);
  assert.doesNotMatch(JSON.stringify(view), /hpp|profit|margin|directCosts|Rahasia|secret-id/);
  assert.match(invoiceWhatsappMessage(invoice, state, "https://example.test/preview/invoices/token"), /Lihat invoice digital: https:\/\/example.test\/preview\/invoices\/token/);
});
