import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createBusinessCommands } from "../src/application/use-cases/business-commands";
import { seedBusinessState, type BusinessState } from "../src/domain/business-state";
import { calculateInvoice, invoiceDirectCostTotal, invoiceTransactionProfit, type InvoiceInput } from "../src/domain/invoice";
import { buildRestoReport } from "../src/domain/resto-reports";
import { createLocalBusinessStore, normalizeBusinessState } from "../src/infrastructure/repositories/local-business-store";
import WorkspacePage from "../src/presentation/dashboard/WorkspacePage";

const baseInput: InvoiceInput = {
  channel: "ONLINE",
  restaurantId: "",
  customerName: "Pelanggan uji",
  date: "2026-11-11",
  dueDate: "2026-11-11",
  items: [{ productId: "product-1", quantity: 2, marginQuantity: 0, sellingPrice: 86000 }],
  directCosts: [
    { id: "c1", category: "PACKAGING", name: "Box styrofoam", amount: 15000 },
    { id: "c2", category: "ICE", name: "Es balok", amount: 5000 },
  ],
  discount: 0,
};

function fixture() {
  let raw = JSON.stringify(seedBusinessState());
  const store = createLocalBusinessStore(() => ({ getItem: () => raw, setItem: (_key, value) => { raw = value; } }));
  const getState = () => store.getSnapshot().state;
  const commands = createBusinessCommands(store.update, getState);
  return { commands, getState };
}

test("direct costs reduce transaction profit and are validated", () => {
  const state = seedBusinessState();
  const ok = calculateInvoice(state, baseInput);
  assert.equal(ok.ok, true);
  assert.equal(ok.directCosts.length, 2);

  const bad = calculateInvoice(state, { ...baseInput, directCosts: [{ id: "x", category: "PACKAGING", name: " ", amount: 0 }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors["directCosts.0.name"]);
  assert.ok(bad.errors["directCosts.0.amount"]);

  const f = fixture();
  const created = f.commands.createInvoice(baseInput);
  assert.equal(created.ok, true, created.message);
  const invoice = f.getState().invoices.find((item) => item.id === created.id)!;
  assert.equal(invoiceDirectCostTotal(invoice), 20000);
  const hpp = invoice.items.reduce((sum, item) => sum + item.hppTotal, 0);
  assert.equal(invoiceTransactionProfit(invoice), invoice.total - hpp - 20000);
});

test("report aggregates direct costs per category and lowers net profit", () => {
  const f = fixture();
  f.commands.createInvoice(baseInput);
  f.commands.createInvoice({ ...baseInput, directCosts: [{ id: "c3", category: "PACKAGING", name: "Box", amount: 10000 }] });
  const state = f.getState();
  const report = buildRestoReport(state, "all", "2026-11-11");
  assert.equal(report.metrics.directCosts, 30000);
  assert.deepEqual(report.directCostByCategory, [
    { category: "PACKAGING", amount: 25000 },
    { category: "ICE", amount: 5000 },
  ]);
  assert.equal(report.metrics.transactionProfit, report.metrics.grossProfit - 30000);
  assert.equal(report.metrics.netProfit, report.metrics.transactionProfit - report.metrics.operatingExpenses);
});

test("legacy invoices without direct costs still load and report zero", () => {
  const legacy = JSON.parse(JSON.stringify(seedBusinessState()));
  delete legacy.company; delete legacy.users; delete legacy.auditLogs;
  for (const invoice of legacy.invoices) delete invoice.directCosts;
  const migrated = normalizeBusinessState(legacy);
  assert.equal(migrated.company.name, "megaseafood");
  assert.equal(migrated.users.length, 1);
  assert.deepEqual(migrated.auditLogs, []);
  assert.equal(buildRestoReport(migrated, "all", "2026-11-11").metrics.directCosts, 0);

  const broken = JSON.parse(JSON.stringify(seedBusinessState()));
  broken.invoices[0].directCosts = [{ id: "x", category: "NOPE", name: "a", amount: 1 }];
  assert.throws(() => normalizeBusinessState(broken));
});

test("audit log records invoice, payment, and company changes", () => {
  const f = fixture();
  const created = f.commands.createInvoice(baseInput);
  f.commands.addPayment({ invoiceId: created.id!, date: "2026-11-11", amount: 1000, method: "Transfer", reference: "" });
  const result = f.commands.updateCompany({ ...f.getState().company, name: "Mega Seafood", bankAccount: "1234567890" });
  assert.equal(result.ok, true, result.message);
  const actions = f.getState().auditLogs.map((log) => log.action);
  assert.deepEqual(actions, ["INVOICE_CREATED", "PAYMENT_RECORDED", "COMPANY_UPDATED"]);
  assert.equal(f.getState().auditLogs[0].userName, "Pemilik");
  assert.equal(f.getState().company.name, "Mega Seafood");
  assert.equal(f.commands.updateCompany({ ...f.getState().company, name: " " }).ok, false);
  assert.equal(f.commands.updateCompany({ ...f.getState().company, email: "salah" }).ok, false);
});

test("users can be added and the last active owner is protected", () => {
  const f = fixture();
  assert.equal(f.commands.addUser({ name: "Sari", email: "sari@bisnis.id", role: "FINANCE" }).ok, true);
  assert.equal(f.commands.addUser({ name: "Dobel", email: "SARI@bisnis.id", role: "STAFF" }).ok, false);
  assert.equal(f.commands.addUser({ name: "X", email: "bukan-email", role: "STAFF" }).ok, false);
  const owner = f.getState().users.find((user) => user.role === "OWNER")!;
  assert.equal(f.commands.toggleUserStatus(owner.id).ok, false);
  assert.equal(f.commands.updateUser(owner.id, { name: owner.name, email: owner.email, role: "STAFF" }).ok, false);
  const sari = f.getState().users.find((user) => user.email === "sari@bisnis.id")!;
  assert.equal(f.commands.toggleUserStatus(sari.id).ok, true);
  assert.equal(f.getState().users.find((user) => user.id === sari.id)!.status, "INACTIVE");
});

test("settings page and internal cost UI render", () => {
  const f = fixture();
  f.commands.createInvoice(baseInput);
  const render = (page: string, state: BusinessState, initialFormOpen = false) =>
    renderToStaticMarkup(createElement(WorkspacePage, { module: "resto", page, business: state, commands: f.commands, onNotify: () => {}, initialFormOpen }));
  const settings = render("Pengaturan Resto", f.getState());
  assert.match(settings, /Profil bisnis/);
  assert.match(settings, /Rekening pembayaran/);
  assert.match(settings, /Audit log/);
  assert.match(settings, /Pengguna/);
  const form = render("Invoices", f.getState(), true);
  assert.match(form, /Biaya Internal/);
  assert.match(form, /Tambah Biaya/);
});
