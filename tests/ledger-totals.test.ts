import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLedgerGroups,
  ledgerMonthTotals,
  ledgerPeriodTotals,
  ledgerPreviewTotals,
} from "../src/domain/ledger";
import { asWholeRupiah } from "../src/domain/form-input";
import type { LapakSale } from "../src/domain/business-state";

const sale = (overrides: Partial<LapakSale>) =>
  ({
    id: "s",
    customerName: "Budi",
    date: "2026-11-05",
    kind: "KREDIT",
    amount: 0,
    createdAt: "2026-11-05T08:00:00.000Z",
    ...overrides,
  }) as LapakSale;

const rows = [
  sale({ id: "1", date: "2026-10-03", kind: "KREDIT", amount: 1000 }),
  sale({ id: "2", date: "2026-11-05", kind: "DEBIT", amount: 400 }),
  sale({ id: "3", customerName: "Ani", date: "2026-11-06", kind: "KREDIT", amount: 250 }),
];

test("ledgerPeriodTotals counts only lines inside the period, but keeps the real restan", () => {
  const groups = buildLedgerGroups(rows);
  const totals = ledgerPeriodTotals(groups, {
    from: "2026-11-01",
    to: "2026-11-30",
  });
  assert.equal(totals.customers, 2);
  assert.equal(totals.credit, 250);
  assert.equal(totals.debit, 400);
  assert.equal(totals.restan, 850);
});

test("ledgerPeriodTotals without a range returns the whole book", () => {
  const groups = buildLedgerGroups(rows);
  assert.deepEqual(ledgerPeriodTotals(groups, null), {
    customers: 2,
    credit: 1250,
    debit: 400,
    restan: 850,
  });
});

test("ledgerMonthTotals sums credit, debit and transaction count of a month", () => {
  const groups = buildLedgerGroups(rows);
  assert.deepEqual(ledgerMonthTotals(groups), {
    credit: 1250,
    debit: 400,
    transactions: 3,
  });
});

test("ledgerPreviewTotals parses rupiah text per kind", () => {
  assert.deepEqual(
    ledgerPreviewTotals([
      { kind: "KREDIT", amount: "1.500.000" },
      { kind: "KREDIT", amount: "" },
      { kind: "DEBIT", amount: "250.000" },
    ]),
    { previewCredit: 1500000, previewDebit: 250000 },
  );
});

test("asWholeRupiah ignores separators and treats invalid input as zero", () => {
  assert.equal(asWholeRupiah("1.250.000"), 1250000);
  assert.equal(asWholeRupiah("abc"), 0);
});
