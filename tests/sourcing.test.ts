import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sourcingOutstanding,
  sourcingPaid,
  sourcingTotals,
} from "../src/domain/sourcing";
import type { Sourcing } from "../src/domain/business-state";

const row = (overrides: Partial<Sourcing>): Sourcing =>
  ({
    id: "s",
    sequence: 1,
    date: "2026-06-12",
    sourceType: "SUPPLIER",
    name: "CV Test",
    type: "Udang",
    weight: 1,
    unit: "kg",
    price: 0,
    total: 0,
    payment1: 0,
    payment1Date: "",
    payment2: 0,
    payment2Date: "",
    payment3: 0,
    payment3Date: "",
    note: "",
    ...overrides,
  }) as Sourcing;

test("sourcingPaid sums the three payment slots", () => {
  assert.equal(
    sourcingPaid(row({ payment1: 100, payment2: 50, payment3: 25 })),
    175,
  );
  assert.equal(sourcingPaid(row({})), 0);
});

test("sourcingOutstanding is total minus all three slots", () => {
  const item = row({ total: 1000, payment1: 300, payment2: 200, payment3: 100 });
  assert.equal(sourcingOutstanding(item), 400);
  assert.equal(sourcingOutstanding(row({ total: 500, payment1: 500 })), 0);
});

test("sourcingTotals aggregates a list of sourcings", () => {
  const totals = sourcingTotals([
    row({ id: "a", total: 1000, payment1: 400 }),
    row({ id: "b", total: 600, payment2: 600 }),
  ]);
  assert.deepEqual(totals, { total: 1600, paid: 1000, outstanding: 600 });
  assert.deepEqual(sourcingTotals([]), { total: 0, paid: 0, outstanding: 0 });
});
