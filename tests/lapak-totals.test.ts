import assert from "node:assert/strict";
import { test } from "node:test";
import {
  commissionTotalForBatch,
  expenseTotalForBatch,
  lapakPeriodTotals,
} from "../src/domain/lapak-totals";

test("lapakPeriodTotals sums commissions, kredit sales, sourcing and expenses", () => {
  const totals = lapakPeriodTotals({
    commissions: [{ amount: 1000 }, { amount: -200 }],
    sales: [
      { amount: 500, kind: "KREDIT" },
      { amount: 300, kind: "DEBIT" },
    ],
    sourcings: [{ total: 4000 }],
    expenses: [{ amount: 150 }],
  });
  assert.equal(totals.commissionTotal, 800);
  assert.equal(totals.salesTotal, 500);
  assert.equal(totals.sourcingTotal, 4000);
  assert.equal(totals.expenseTotal, 150);
});

test("lapakPeriodTotals returns zero for empty periods", () => {
  assert.deepEqual(
    lapakPeriodTotals({ commissions: [], sales: [], sourcings: [], expenses: [] }),
    { commissionTotal: 0, salesTotal: 0, sourcingTotal: 0, expenseTotal: 0 },
  );
});

test("per-batch totals only include records of that batch", () => {
  const commissions = [
    { amount: 1000, batchId: "b1" },
    { amount: 700, batchId: "b2" },
    { amount: 300, batchId: "b1" },
  ];
  const expenses = [
    { amount: 50, batchId: "b1" },
    { amount: 90, batchId: "b2" },
  ];
  assert.equal(commissionTotalForBatch(commissions, { id: "b1" }), 1300);
  assert.equal(expenseTotalForBatch(expenses, { id: "b1" }), 50);
  assert.equal(commissionTotalForBatch(commissions, { id: "missing" }), 0);
});
