import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBusinessState } from "../src/domain/business-state";
import { searchBusiness } from "../src/domain/global-search";

test("global search finds products, customers, and invoice numbers case-insensitively", () => {
  const state = emptyBusinessState();
  state.products.push({ id: "p-1", sku: "UDG-1", name: "Udang Vaname", category: "Udang", size: "31/40", unit: "kg", defaultSellingPrice: 100, trackStock: true, manualCost: 0, averageHpp: 70, latestPurchaseCost: 70, stockBalance: 4, minimumStock: 2, status: "ACTIVE" });
  state.restaurants.push({ id: "r-1", name: "Dapoer Ikan", contactName: "Ayu", phone: "0812", email: "", address: "", notes: "", paymentTermDays: 7, status: "ACTIVE" });
  state.invoices.push({ id: "i-1", invoiceNumber: "INV-2026-001", salesChannel: "RESTAURANT", restaurantId: "r-1", customerName: "Dapoer Ikan", date: "2026-11-01", dueDate: "2026-11-08", status: "ISSUED", items: [], subtotal: 500, discount: 0, total: 500, paidAmount: 0, outstandingAmount: 500 });

  assert.equal(searchBusiness(state, "udang")[0]?.title, "Udang Vaname");
  assert.equal(searchBusiness(state, "DAPOER")[0]?.kind, "Restoran");
  const invoice = searchBusiness(state, "inv-2026-001").find((result) => result.kind === "Invoice");
  assert.equal(invoice?.invoiceId, "i-1");
  assert.equal(invoice?.page, "Invoice");
  assert.deepEqual(searchBusiness(state, "   "), []);
});
