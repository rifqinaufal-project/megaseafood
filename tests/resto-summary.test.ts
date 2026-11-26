import assert from "node:assert/strict";
import { test } from "node:test";
import type { Invoice, Receipt } from "../src/domain/business-state";
import {
  restaurantReceivable,
  restaurantReceivableTotal,
  stockValue,
  supplierDebtTotal,
  supplierPurchaseTotal,
} from "../src/domain/resto-summary";

const receipt = (overrides: Partial<Receipt>) =>
  ({ status: "POSTED", subtotal: 0, ...overrides }) as Receipt;

const invoice = (overrides: Partial<Invoice>) =>
  ({ restaurantId: undefined, outstandingAmount: 0, ...overrides }) as Invoice;

test("stockValue multiplies balance by average HPP", () => {
  assert.equal(
    stockValue([
      { stockBalance: 10, averageHpp: 5000 },
      { stockBalance: 2, averageHpp: 1500 },
    ]),
    53000,
  );
  assert.equal(stockValue([]), 0);
});

test("supplier totals use subtotal and unpaid amount, treating unknown payment as zero", () => {
  const receipts = [
    receipt({ subtotal: 1000, paidAmount: 400 }),
    receipt({ subtotal: 500 }),
    receipt({ subtotal: 300, paidAmount: 300 }),
  ];
  assert.equal(supplierPurchaseTotal(receipts), 1800);
  assert.equal(supplierDebtTotal(receipts), 600);
});

test("cancelled receipts add no debt", () => {
  const receipts = [receipt({ status: "CANCELLED", subtotal: 900 })];
  assert.equal(supplierDebtTotal(receipts), 0);
});

test("restaurant receivables sum only that restaurant's invoices", () => {
  const invoices = [
    invoice({ restaurantId: "r1", outstandingAmount: 200 }),
    invoice({ restaurantId: "r1", outstandingAmount: 50 }),
    invoice({ restaurantId: "r2", outstandingAmount: 70 }),
    invoice({ outstandingAmount: 999 }),
  ];
  assert.equal(restaurantReceivable(invoices, "r1"), 250);
  assert.equal(restaurantReceivableTotal(invoices), 320);
});
