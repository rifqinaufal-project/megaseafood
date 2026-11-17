import assert from "node:assert/strict";
import { test } from "node:test";
import { createBusinessCommands } from "../src/application/use-cases/business-commands";
import { seedBusinessState } from "../src/domain/business-state";
import { receiptOutstanding } from "../src/domain/business-integrity";
import { weightDifferenceRows } from "../src/domain/inventory";
import { normalizeBusinessState } from "../src/infrastructure/repositories/local-business-store";

function fixture() {
  let state = seedBusinessState();
  const commands = createBusinessCommands((update) => { state = update(state); }, () => state);
  return { commands, getState: () => state };
}

const productInput = { name: "Kepiting Bakau", category: "Kepiting", size: "Jumbo", unit: "kg", sellingPrice: 120000, minimumStock: 5, initialCost: 90000 };

test("a product can be added from scratch with auto SKU and no stock", () => {
  const { commands, getState } = fixture();
  const result = commands.addProduct(productInput);
  assert.equal(result.ok, true);
  const created = getState().products.find((item) => item.id === result.id)!;
  assert.match(created.sku, /^KEP-\d{3}$/);
  assert.equal(created.stockBalance, 0);
  assert.equal(created.averageHpp, 90000);
  assert.equal(commands.addProduct(productInput).ok, false);
});

test("a product can be edited, deactivated, and only deleted while it has no history", () => {
  const { commands, getState } = fixture();
  const id = commands.addProduct(productInput).id!;
  assert.equal(commands.updateProduct(id, { ...productInput, name: "Kepiting Soka", sellingPrice: 130000 }).ok, true);
  assert.equal(getState().products.find((item) => item.id === id)!.defaultSellingPrice, 130000);
  assert.equal(commands.toggleProductStatus(id).ok, true);
  assert.equal(getState().products.find((item) => item.id === id)!.status, "INACTIVE");
  assert.equal(commands.deleteProduct(id).ok, true);
  assert.equal(commands.deleteProduct("product-1").ok, true);
});

test("a product with receipts or movements cannot be deleted", () => {
  const { commands, getState } = fixture();
  commands.receiveStock({ supplierId: "supplier-1", date: "2026-11-11", productId: "product-2", manualWeight: 5, digitalWeight: 5, unitPurchasePrice: 20000, paidAmount: 0 });
  assert.equal(commands.deleteProduct("product-2").ok, false);
  assert.ok(getState().products.some((item) => item.id === "product-2"));
});

test("multi-product receipts post one movement per product and use manual weight for payment", () => {
  const { commands, getState } = fixture();
  const result = commands.receiveStock({
    supplierId: "supplier-1",
    date: "2026-11-11",
    paidAmount: 100000,
    supplierReference: "SJ-01",
    dueDate: "2026-11-20",
    notes: "Pagi",
    items: [
      { productId: "product-1", manualQuantity: 10, digitalQuantity: 11, unitCost: 80000 },
      { productId: "product-2", manualQuantity: 5, digitalQuantity: 5, unitCost: 20000 },
    ],
  });
  assert.equal(result.ok, true);
  const state = getState();
  const receipt = state.receipts[0];
  assert.equal(receipt.subtotal, 900000);
  assert.equal(receiptOutstanding(receipt), 800000);
  assert.equal(state.stockMovements.filter((item) => item.type === "PURCHASE_IN").length, 2);
  assert.equal(state.products[0].stockBalance, 19);
  assert.equal(state.products[0].latestPurchaseCost, 80000);
  // (8 * 72000 + 10 * 80000) / 19
  assert.equal(state.products[0].averageHpp, Math.round((8 * 72000 + 800000) / 19));
  assert.equal(weightDifferenceRows(state.receipts).length, 1);
  assert.equal(weightDifferenceRows(state.receipts)[0].difference, 1);
  assert.equal(commands.receiveStock({ supplierId: "supplier-1", date: "2026-11-11", paidAmount: 0, items: [{ productId: "product-1", manualQuantity: 1, digitalQuantity: 1, unitCost: 1 }, { productId: "product-1", manualQuantity: 1, digitalQuantity: 1, unitCost: 1 }] }).ok, false);
});

test("cancelling a receipt reverses stock and removes its debt, but not after stock is consumed", () => {
  const { commands, getState } = fixture();
  const id = commands.receiveStock({ supplierId: "supplier-1", date: "2026-11-11", productId: "product-1", manualWeight: 10, digitalWeight: 10, unitPurchasePrice: 72000, paidAmount: 0 }).id!;
  assert.equal(commands.cancelStockReceipt(id, "").ok, false);
  assert.equal(commands.cancelStockReceipt(id, "Salah input").ok, true);
  assert.equal(getState().products[0].stockBalance, 8);
  assert.equal(getState().products[0].averageHpp, 72000);
  assert.equal(receiptOutstanding(getState().receipts[0]), 0);
  assert.equal(commands.cancelStockReceipt(id, "lagi").ok, false);

  const second = commands.receiveStock({ supplierId: "supplier-1", date: "2026-11-11", productId: "product-1", manualWeight: 1, digitalWeight: 1, unitPurchasePrice: 72000, paidAmount: 0 }).id!;
  commands.adjustStock("product-1", { actualQuantity: 0, minimumStock: 15, notes: "opname" });
  assert.equal(commands.cancelStockReceipt(second, "terlambat").ok, false);
});

test("stock and HPP adjustments require a reason and write the ledger", () => {
  const { commands, getState } = fixture();
  assert.equal(commands.adjustStock("product-1", { actualQuantity: 5, minimumStock: 15, notes: "" }).ok, false);
  assert.equal(commands.adjustStock("product-1", { actualQuantity: 5, minimumStock: 15, notes: "Susut" }).ok, true);
  assert.equal(getState().products[0].stockBalance, 5);
  assert.equal(getState().stockMovements.at(-1)!.type, "ADJUSTMENT_OUT");
  assert.equal(getState().stockMovements.at(-1)!.quantity, -3);
  assert.equal(commands.adjustProductCost("product-1", { newCost: 70000, reason: "" }).ok, false);
  assert.equal(commands.adjustProductCost("product-1", { newCost: 70000, reason: "Koreksi" }).ok, true);
  assert.equal(getState().products[0].averageHpp, 70000);
});

test("invoice create, edit and delete keep the stock ledger consistent with balances", () => {
  const { commands, getState } = fixture();
  const input = { channel: "RESTAURANT" as const, restaurantId: "restaurant-1", customerName: "Dapoer Ikan", date: "2026-11-11", dueDate: "2026-11-25", items: [{ productId: "product-1", quantity: 2, marginQuantity: 0, sellingPrice: 86000 }], discount: 0 };
  const id = commands.createInvoice(input).id!;
  assert.equal(getState().stockMovements.at(-1)!.type, "SALE_OUT");
  assert.equal(getState().stockMovements.at(-1)!.quantity, -2);
  commands.updateInvoice(id, { ...input, items: [{ ...input.items[0], quantity: 1 }] });
  assert.equal(getState().stockMovements.at(-1)!.quantity, 1);
  commands.deleteInvoice(id);
  const net = getState().stockMovements.reduce((sum, item) => sum + item.quantity, 0);
  assert.equal(net, 0);
  assert.equal(getState().products[0].stockBalance, 8);
});

test("supplier debt payments reduce outstanding and reject overpayment or unverified legacy receipts", () => {
  const { commands, getState } = fixture();
  const id = commands.receiveStock({ supplierId: "supplier-1", date: "2026-11-11", productId: "product-1", manualWeight: 10, digitalWeight: 10, unitPurchasePrice: 10000, paidAmount: 20000 }).id!;
  assert.equal(commands.paySupplierReceipt({ receiptId: id, date: "2026-11-12", amount: 90000, method: "Transfer", reference: "" }).ok, false);
  assert.equal(commands.paySupplierReceipt({ receiptId: id, date: "2026-11-12", amount: 80000, method: "Transfer", reference: "TRX" }).ok, true);
  assert.equal(receiptOutstanding(getState().receipts[0]), 0);
  assert.equal(getState().supplierPayments.length, 1);

  delete getState().receipts[0].paidAmount;
  assert.equal(commands.paySupplierReceipt({ receiptId: id, date: "2026-11-12", amount: 1000, method: "Tunai", reference: "" }).ok, false);
  assert.equal(commands.verifyReceiptPayment(id, 100000).ok, true);
  assert.equal(receiptOutstanding(getState().receipts[0]), 0);
});

test("supplier, restaurant and expense CRUD protect records that carry history", () => {
  const { commands, getState } = fixture();
  assert.equal(commands.updateSupplier("supplier-1", { name: "CV Baru", contactName: "A", phone: "1", email: "a@b.id", address: "Jl. X" }).ok, true);
  assert.equal(getState().suppliers[0].address, "Jl. X");
  commands.receiveStock({ supplierId: "supplier-1", date: "2026-11-11", productId: "product-1", manualWeight: 1, digitalWeight: 1, unitPurchasePrice: 1000, paidAmount: 0 });
  assert.equal(commands.deleteSupplier("supplier-1").ok, false);
  assert.equal(commands.deleteSupplier("supplier-2").ok, true);
  assert.equal(commands.toggleSupplierStatus("supplier-1").ok, true);

  assert.equal(commands.updateRestaurant("restaurant-1", { name: "Dapoer", contactName: "", phone: "", paymentTermDays: 30 }).ok, true);
  assert.equal(getState().restaurants[0].paymentTermDays, 30);
  assert.equal(commands.deleteRestaurant("restaurant-1").ok, false);

  const expenseId = (commands.addOperatingExpense({ date: "2026-11-11", category: "Logistik", description: "Bensin", amount: 1000 }), getState().operatingExpenses.at(-1)!.id);
  assert.equal(commands.updateOperatingExpense(expenseId, { date: "2026-11-11", category: "Logistik", description: "Solar", amount: 2000 }).ok, true);
  assert.equal(getState().operatingExpenses.at(-1)!.description, "Solar");
  assert.equal(commands.deleteOperatingExpense(expenseId).ok, true);
});

test("restaurant-specific prices upsert per restaurant and product", () => {
  const { commands, getState } = fixture();
  assert.equal(commands.setCustomerPrice({ restaurantId: "restaurant-1", productId: "product-1", sellingPrice: 0 }).ok, false);
  const id = commands.setCustomerPrice({ restaurantId: "restaurant-1", productId: "product-1", sellingPrice: 90000 }).id!;
  commands.setCustomerPrice({ restaurantId: "restaurant-1", productId: "product-1", sellingPrice: 95000 });
  assert.equal(getState().customerPrices.length, 1);
  assert.equal(getState().customerPrices[0].sellingPrice, 95000);
  assert.equal(commands.deleteCustomerPrice(id).ok, true);
  assert.equal(getState().customerPrices.length, 0);
});

test("data saved by the previous version migrates in place with defaults", () => {
  const legacy = JSON.parse(JSON.stringify(seedBusinessState()));
  for (const product of legacy.products) { delete product.size; delete product.latestPurchaseCost; }
  for (const supplier of legacy.suppliers) { delete supplier.email; delete supplier.address; }
  for (const restaurant of legacy.restaurants) { delete restaurant.email; delete restaurant.address; delete restaurant.notes; }
  delete legacy.stockMovements; delete legacy.customerPrices; delete legacy.supplierPayments;
  legacy.receipts = [{ id: "receipt-old", receiptNumber: "RCV/2026/06/0001", supplierId: "supplier-1", date: "2026-06-01", productId: "product-1", manualWeight: 4, digitalWeight: 5, unitPurchasePrice: 70000, subtotal: 350000, status: "POSTED", paidAmount: 100000 }];
  const migrated = normalizeBusinessState(legacy);
  assert.equal(migrated.products[0].size, "");
  assert.equal(migrated.products[0].latestPurchaseCost, migrated.products[0].averageHpp);
  assert.equal(migrated.suppliers[0].address, "");
  assert.equal(migrated.restaurants[0].notes, "");
  assert.deepEqual(migrated.stockMovements, []);
  assert.equal(migrated.receipts[0].items[0].digitalQuantity, 5);
  assert.equal(migrated.receipts[0].items[0].unitCost, 70000);
  assert.equal(migrated.receipts[0].dueDate, "");
  assert.equal(receiptOutstanding(migrated.receipts[0]), 250000);
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import WorkspacePage from "../src/presentation/dashboard/WorkspacePage";

function renderResto(page: string, state = seedBusinessState(), initialFormOpen = false) {
  const commands = createBusinessCommands(() => {}, () => state);
  return renderToStaticMarkup(createElement(WorkspacePage, { module: "resto", page, business: state, commands, onNotify: () => {}, initialFormOpen }));
}

test("Stok page offers adding a product, receiving stock and the four tabs", () => {
  const html = renderResto("Stok");
  for (const text of ["Tambah produk", "Terima stok", "Produk &amp; Stok", "Mutasi Stok", "Selisih Timbangan", "Harga Jual", "Stok menipis", "Nilai persediaan", "Udang Vaname 31/40"]) assert.match(html, new RegExp(text));
  assert.doesNotMatch(html, /Total data|Storage|Tersimpan lokal/);
});

test("Stok quick-add opens the receive-stock dialog", () => {
  assert.match(renderResto("Stok", seedBusinessState(), true), /Berat manual/);
});

test("Supplier and Restoran pages show real summaries and row actions", () => {
  const suppliers = renderResto("Supplier");
  assert.match(suppliers, /Utang berjalan/);
  assert.match(suppliers, /Nonaktifkan supplier/);
  const restaurants = renderResto("Restoran");
  assert.match(restaurants, /Piutang berjalan/);
  assert.match(restaurants, /Edit restoran/);
  assert.doesNotMatch(restaurants, /Total data|Storage/);
});

test("Pengeluaran page lists edit and delete actions", () => {
  const state = seedBusinessState();
  state.operatingExpenses = [{ id: "exp-1", date: "2026-11-11", category: "Logistik", description: "Bensin", amount: 10000 }];
  const html = renderResto("Pengeluaran", state);
  assert.match(html, /Edit pengeluaran/);
  assert.match(html, /Hapus pengeluaran/);
  assert.match(html, /Bensin/);
});
