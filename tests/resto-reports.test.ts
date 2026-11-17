import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createBusinessCommands } from "../src/application/use-cases/business-commands";
import { seedBusinessState, type BusinessState, type Invoice, type Receipt } from "../src/domain/business-state";
import { effectiveInvoiceStatus } from "../src/domain/invoice";
import {
  buildRestoReport,
  periodRange,
  reportAnchor,
  supplierBillStatus,
  supplierPayableSummary,
} from "../src/domain/resto-reports";
import WorkspacePage from "../src/presentation/dashboard/WorkspacePage";
import { RestoDashboardPage, RestoReportsPage } from "../src/presentation/dashboard/RestoReports";

const item = (hppTotal: number, marginQuantity: number, sellingPrice: number) => ({
  productId: "p",
  stockQuantity: 1,
  marginQuantity,
  billingQuantity: 1,
  sellingPrice,
  hpp: hppTotal,
  subtotal: sellingPrice,
  hppTotal,
  profit: sellingPrice - hppTotal,
});

function invoice(id: string, date: string, total: number, paid: number, hpp: number, margin = 0, dueDate = date): Invoice {
  const base = seedBusinessState().invoices[0];
  return {
    ...base,
    id,
    invoiceNumber: id,
    date,
    dueDate,
    total,
    subtotal: total,
    paidAmount: paid,
    outstandingAmount: total - paid,
    status: paid >= total ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "ISSUED",
    items: [item(hpp, margin, total)],
  };
}

function state(): BusinessState {
  const base = seedBusinessState();
  return {
    ...base,
    invoices: [
      invoice("A", "2026-11-10", 1000, 1000, 600),
      invoice("B", "2026-11-09", 2000, 500, 1200, 1, "2026-11-12"),
      invoice("C", "2026-10-01", 4000, 0, 3000),
    ],
    operatingExpenses: [{ ...base.operatingExpenses[0], date: "2026-11-10", category: "Logistik", amount: 100 }],
    receipts: [],
  };
}

test("report anchor follows the latest transaction and never exceeds today", () => {
  const s = state();
  assert.equal(reportAnchor(s, "2026-11-17"), "2026-11-10");
  assert.equal(reportAnchor(s, "2026-11-05"), "2026-11-05");
  const range = periodRange("7d", "2026-11-10");
  assert.equal(range.start, "2026-11-04");
  assert.equal(range.previous?.end, "2026-11-03");
});

test("buildRestoReport filters by period and derives profit, receivables and overdue", () => {
  const s = state();
  const week = buildRestoReport(s, "7d", "2026-11-17");
  assert.equal(week.metrics.orders, 2);
  assert.equal(week.metrics.revenue, 3000);
  assert.equal(week.metrics.hpp, 1800);
  assert.equal(week.metrics.operatingExpenses, 100);
  assert.equal(week.metrics.netProfit, 1100);
  assert.equal(week.metrics.receivables, 1500);
  assert.equal(week.metrics.overdueCount, 1);
  assert.equal(week.metrics.paidAmount, 1500);
  assert.equal(week.daily.length, 2);
  assert.deepEqual(week.expenseByCategory, [{ category: "Logistik", amount: 100 }]);
  const all = buildRestoReport(s, "all", "2026-11-17");
  assert.equal(all.metrics.orders, 3);
  assert.equal(all.metrics.ordersChange, null);
  const empty = buildRestoReport({ ...s, invoices: [], operatingExpenses: [] }, "30d", "2026-11-17");
  assert.equal(empty.metrics.netMargin, 0);
  assert.equal(empty.daily.length, 0);
});

test("effectiveInvoiceStatus marks unpaid invoices past due date as overdue", () => {
  const unpaid = invoice("X", "2026-11-01", 100, 0, 0, 0, "2026-11-05");
  assert.equal(effectiveInvoiceStatus(unpaid, "2026-11-05"), "ISSUED");
  assert.equal(effectiveInvoiceStatus(unpaid, "2026-11-06"), "OVERDUE");
  assert.equal(effectiveInvoiceStatus(invoice("Y", "2026-11-01", 100, 100, 0, 0, "2026-11-05"), "2026-12-01"), "PAID");
});

test("supplier payables ignore legacy receipts without payment data", () => {
  const base = seedBusinessState();
  const receipt = (id: string, over: Partial<Receipt>): Receipt => ({
    id,
    receiptNumber: id,
    supplierId: "s",
    date: "2026-11-01",
    items: [],
    subtotal: 1000,
    status: "POSTED",
    supplierReference: "",
    dueDate: "2026-11-10",
    notes: "",
    ...over,
  } as Receipt);
  void base;
  const receipts = [
    receipt("open", { paidAmount: 400 }),
    receipt("late", { paidAmount: 0, dueDate: "2026-11-01" }),
    receipt("paid", { paidAmount: 1000 }),
    receipt("legacy", {}),
    receipt("void", { status: "CANCELLED", paidAmount: 0 }),
  ];
  assert.equal(supplierBillStatus(receipts[0], "2026-11-05"), "OPEN");
  assert.equal(supplierBillStatus(receipts[1], "2026-11-05"), "OVERDUE");
  assert.equal(supplierBillStatus(receipts[3], "2026-11-05"), "VERIFY");
  const summary = supplierPayableSummary(receipts, "2026-11-05");
  assert.equal(summary.total, 1600);
  assert.equal(summary.openCount, 2);
  assert.equal(summary.overdueCount, 1);
  assert.equal(summary.overdueAmount, 1000);
  assert.equal(summary.unverifiedCount, 1);
});

test("Resto dashboard and report pages render the sultan structure", () => {
  const s = seedBusinessState();
  const dash = renderToStaticMarkup(createElement(RestoDashboardPage, { business: s, onNavigate: () => {} }));
  for (const text of ["Order dalam periode", "Pendapatan periode", "Piutang berjalan", "Laba Bersih", "Nilai persediaan", "Margin bersih", "Penjualan Harian", "Status Piutang", "Ringkasan Keuangan", "Invoice Belum Lunas", "1 hari", "30 hari"])
    assert.match(dash, new RegExp(text));
  const report = renderToStaticMarkup(createElement(RestoReportsPage, { business: s, onNotify: () => {}, onNavigate: () => {} }));
  for (const text of ["Laporan Penjualan", "Hutang Supplier", "Piutang", "Daftar Invoice Penjualan", "Export"])
    assert.match(report, new RegExp(text));
  assert.doesNotMatch(report, /Sales & revenue/);
});

test("Laporan route in the workspace renders the report page", () => {
  const f = seedBusinessState();
  const commands = createBusinessCommands(() => ({ ok: true, message: "" }) as never, () => f);
  const html = renderToStaticMarkup(
    createElement(WorkspacePage, { module: "resto", page: "Laporan", business: f, commands, onNotify: () => {} }),
  );
  assert.match(html, /Laporan Penjualan/);
});
