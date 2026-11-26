import assert from "node:assert/strict";
import { test } from "node:test";
import type { Commission, LapakExpense } from "../src/domain/business-state";
import {
  commissionSummary,
  lapakExpenseSummary,
} from "../src/domain/lapak-summary";

const commission = (overrides: Partial<Commission>): Commission =>
  ({
    id: "commission",
    batchId: "batch-1",
    date: "2026-06-12",
    partner: "Partner",
    amount: 0,
    note: "",
    ...overrides,
  }) as Commission;

const expense = (overrides: Partial<LapakExpense>): LapakExpense =>
  ({
    id: "expense",
    batchId: "batch-1",
    date: "2026-06-12",
    expenseName: "Biaya",
    amount: 0,
    notes: "",
    ...overrides,
  }) as LapakExpense;

test("commissionSummary aggregates totals, unique partners, and averages", () => {
  assert.deepEqual(
    commissionSummary([
      commission({ id: "a", partner: "  Partner A ", amount: 100 }),
      commission({ id: "b", partner: "Partner A", amount: 50 }),
      commission({ id: "c", partner: "Partner B", amount: 25 }),
      commission({ id: "d", partner: "   ", amount: 10 }),
    ], null),
    { count: 4, total: 185, partners: 2, average: 46.25 },
  );
});

test("commissionSummary filters inclusively by date range", () => {
  assert.deepEqual(
    commissionSummary(
      [
        commission({ id: "before", date: "2026-06-11", amount: 10 }),
        commission({ id: "from", date: "2026-06-12", amount: 20 }),
        commission({ id: "to", date: "2026-06-18", amount: 40 }),
        commission({ id: "after", date: "2026-06-19", amount: 80 }),
      ],
      { from: "2026-06-12", to: "2026-06-18" },
    ),
    { count: 2, total: 60, partners: 1, average: 30 },
  );
});

test("commissionSummary returns zero metrics for an empty selection", () => {
  assert.deepEqual(commissionSummary([], null), {
    count: 0,
    total: 0,
    partners: 0,
    average: 0,
  });
});

test("lapakExpenseSummary aggregates totals, unique batches, and averages", () => {
  assert.deepEqual(
    lapakExpenseSummary(
      [
        expense({ id: "a", batchId: "batch-1", amount: 100 }),
        expense({ id: "b", batchId: "batch-1", amount: 50 }),
        expense({ id: "c", batchId: "batch-2", amount: 25 }),
      ],
      null,
    ),
    { count: 3, total: 175, batches: 2, average: 175 / 3 },
  );
});

test("lapakExpenseSummary filters inclusively by date range", () => {
  assert.deepEqual(
    lapakExpenseSummary(
      [
        expense({ id: "before", date: "2026-06-11", amount: 10 }),
        expense({ id: "from", date: "2026-06-12", amount: 20 }),
        expense({ id: "to", date: "2026-06-18", amount: 40 }),
        expense({ id: "after", date: "2026-06-19", amount: 80 }),
      ],
      { from: "2026-06-12", to: "2026-06-18" },
    ),
    { count: 2, total: 60, batches: 1, average: 30 },
  );
});

test("lapakExpenseSummary returns zero metrics for an empty selection", () => {
  assert.deepEqual(lapakExpenseSummary([], null), {
    count: 0,
    total: 0,
    batches: 0,
    average: 0,
  });
});
