import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBusinessState, seedBusinessState } from "../src/domain/business-state";
import { buildOverview } from "../src/domain/overview";

test("an empty account shows zero everywhere and no sample activity", () => {
  const overview = buildOverview(emptyBusinessState(), "Bulan ini", "2026-11-17");
  assert.deepEqual(overview.stats.map((item) => item.value), ["Rp 0", "Rp 0", "Rp 0", "Rp 0"]);
  // Ringkasan Overview tidak lagi menampilkan kartu piutang; piutang hidup di modul Resto.
  assert.equal(overview.stats.some((item) => item.label === "Piutang berjalan"), false);
  assert.equal(overview.activities.length, 0);
  assert.equal(overview.cashTotal, "Rp 0");
  assert.ok(overview.wallets.every((item) => item.amount === "Rp 0"));
  assert.equal(overview.chart.hasData, false);
  assert.ok(overview.chart.profit.every((value) => value === 0));
  assert.equal(overview.chart.change, null);
  assert.equal(overview.chart.labels.length, 6);
});

test("overview figures are computed from the business data", () => {
  const state = seedBusinessState();
  const overview = buildOverview(state, "Tahun ini", "2026-06-30");
  assert.ok(overview.activities.length > 0);
  // Pengadaan gets its own card and never reduces profit.
  assert.equal(overview.stats[3].label, "Pengadaan & Bengkelan");
  assert.equal(overview.stats[3].value, "Rp 3.456.000");
  assert.equal(overview.stats[1].value, "Rp 6.530.000");
  assert.equal(overview.activities[0].date.endsWith("2026"), true);
  assert.equal(overview.chart.hasData, true);
  assert.equal(overview.chart.labels.at(-1), "Jun");
  const other = buildOverview(state, "Bulan ini", "2027-03-01");
  assert.equal(other.stats[1].value, "Rp 0");
});
