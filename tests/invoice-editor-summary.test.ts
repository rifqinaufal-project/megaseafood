import assert from "node:assert/strict";
import { test } from "node:test";
import { invoiceEditorSummary } from "../src/domain/invoice-editor-summary";

const line = (overrides: Record<string, number>) => ({
  hppTotal: 0,
  marginQuantity: 0,
  sellingPrice: 0,
  ...overrides,
});

test("invoiceEditorSummary derives HPP, margin and profit from the calculation", () => {
  const summary = invoiceEditorSummary({
    items: [
      line({ hppTotal: 300, marginQuantity: 2, sellingPrice: 1000 }),
      line({ hppTotal: 200, marginQuantity: 0, sellingPrice: 500 }),
    ],
    directCosts: [{ amount: 100 }],
    total: 1000,
  } as never);
  assert.equal(summary.hppTotal, 500);
  assert.equal(summary.marginQty, 2);
  assert.equal(summary.marginRevenue, 2000);
  assert.equal(summary.directTotal, 100);
  assert.equal(summary.revenue, 1000);
  assert.equal(summary.profit, 400);
  assert.equal(summary.marginPercent, 40);
  assert.equal(summary.productProfit, 500);
});

test("negative margin quantities never reduce margin totals", () => {
  const summary = invoiceEditorSummary({
    items: [line({ marginQuantity: -3, sellingPrice: 1000 })],
    directCosts: [],
    total: 0,
  } as never);
  assert.equal(summary.marginQty, 0);
  assert.equal(summary.marginRevenue, 0);
});

test("non-finite values fall back to zero and zero revenue gives zero percent", () => {
  const summary = invoiceEditorSummary({
    items: [line({ hppTotal: Number.NaN, sellingPrice: Number.POSITIVE_INFINITY })],
    directCosts: [{ amount: Number.NaN }],
    total: 0,
  } as never);
  assert.equal(summary.hppTotal, 0);
  assert.equal(summary.marginRevenue, 0);
  assert.equal(summary.directTotal, 0);
  assert.equal(summary.revenue, 0);
  assert.equal(summary.marginPercent, 0);
});
