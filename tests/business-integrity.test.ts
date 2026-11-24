import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createBusinessCommands } from "../src/application/use-cases/business-commands";
import { formatRupiah, seedBusinessState, type BusinessState } from "../src/domain/business-state";
import { addCalendarDays, isBusinessDate, localDate, receiptOutstanding } from "../src/domain/business-integrity";
import WorkspacePage from "../src/presentation/dashboard/WorkspacePage";
import { resolveWorkspacePage } from "../src/presentation/dashboard/workspace-routing";
import { BUSINESS_STORAGE_KEY, createLocalBusinessStore, normalizeBusinessState } from "../src/infrastructure/repositories/local-business-store";

function memoryCommands(initial = seedBusinessState()) {
  let state = initial;
  const commands = createBusinessCommands((update) => { state = update(state); }, () => state);
  return { commands, getState: () => state };
}

function storageFixture(raw: string | null = JSON.stringify(seedBusinessState())) {
  let saved = raw;
  let fail = false;
  let writes = 0;
  const storage = {
    getItem: (key: string) => { assert.equal(key, BUSINESS_STORAGE_KEY); return saved; },
    setItem: (key: string, value: string) => {
      assert.equal(key, BUSINESS_STORAGE_KEY);
      if (fail) throw new Error("QuotaExceededError");
      saved = value;
      writes++;
    },
  };
  const store = createLocalBusinessStore(() => storage);
  const commands = createBusinessCommands(store.update, () => store.getSnapshot().state);
  return { store, commands, saved: () => saved, writes: () => writes, fail: (value: boolean) => { fail = value; }, externalWrite: (value: string | null) => { saved = value; } };
}

const receiptInput = { supplierId: "supplier-1", date: "2026-11-11", productId: "product-1", manualWeight: 10, digitalWeight: 10, unitPurchasePrice: 10000, paidAmount: 25000 };
const invoiceInput = { channel: "RESTAURANT" as const, restaurantId: "restaurant-1", customerName: "Dapoer Ikan", date: "2026-06-12", dueDate: "2026-06-26", items: [{ productId: "product-1", quantity: 1, marginQuantity: 0, sellingPrice: 86000 }], discount: 0 };
const expenseInput = { batchId: "batch-42", date: "2026-11-11", expenseName: "Es", amount: 10000, notes: "" };

test("local dates and due dates stay correct in Indonesian and DST timezones", () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "America/New_York", "UTC"]) {
      process.env.TZ = timezone;
      assert.equal(addCalendarDays("2026-06-12", 14), "2026-06-26");
      assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01");
      assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
      assert.equal(addCalendarDays("2026-03-07", 2), "2026-03-09");
      assert.equal(addCalendarDays("2026-11-11", 0), "2026-11-11");
    }
    process.env.TZ = "Asia/Jakarta";
    assert.equal(localDate(new Date("2026-11-10T17:30:00Z")), "2026-11-11");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("invalid calendar dates and non-finite amounts are rejected without mutation", () => {
  const { commands, getState } = memoryCommands();
  const initial = getState();
  for (const startDate of ["", "2026-02-29", "2026-11-31", "2026-13-01", "not-a-date"]) {
    assert.equal(isBusinessDate(startDate), false);
    assert.equal(commands.createBatch({ startDate, notes: "" }).ok, false);
  }
  assert.equal(commands.createInvoice({ ...invoiceInput, items: [{ ...invoiceInput.items[0], quantity: NaN }] }).ok, false);
  assert.equal(commands.addPayment({ invoiceId: "invoice-127", date: "2026-02-30", amount: 100, method: "Tunai", reference: "" }).ok, false);
  assert.equal(commands.addOperatingExpense({ date: "2026-11-11", category: "Es", description: "Es", amount: Infinity }).ok, false);
  assert.equal(commands.addRestaurant({ name: "Resto", contactName: "", phone: "", paymentTermDays: 1.5 }).ok, false);
  assert.equal(getState(), initial);
});

test("negative commissions and standalone sourcing are accepted with automatic numbers", () => {
  const { commands, getState } = memoryCommands();
  assert.equal(formatRupiah("-125000"), "-125.000");
  assert.equal(commands.addCommission({ batchId: "batch-42", date: "2026-06-12", partner: "Koreksi", amount: -125000, note: "Retur" }).ok, true);
  const result = commands.addSourcing({
    date: "2026-06-13",
    sourceType: "BENGKELAN",
    name: "Bengkel Muara",
    type: "Perbaikan box",
    weight: 2,
    unit: "unit",
    price: 150000,
    payment1: 100000,
    payment1Date: "2026-06-13",
    payment2: 0,
    payment2Date: "",
    payment3: 0,
    payment3Date: "",
    note: "Selesai sore",
  });
  assert.equal(result.ok, true);
  const sourcing = getState().sourcings.at(-1)!;
  assert.equal(sourcing.sequence, 2);
  assert.equal(sourcing.total, 300000);
  assert.equal("batchId" in sourcing, false);
  commands.deleteBatch("batch-42");
  assert.equal(getState().sourcings.some((item) => item.id === sourcing.id), true);
  assert.equal(getState().commissions.some((item) => item.amount === -125000), false);
  commands.deleteSourcing(sourcing.id);
  const next = commands.addSourcing({
    date: "2026-06-14",
    sourceType: "SUPPLIER",
    name: "Supplier Baru",
    type: "Cumi",
    weight: 1,
    unit: "kg",
    price: 50000,
    payment1: 0,
    payment1Date: "",
    payment2: 0,
    payment2Date: "",
    payment3: 0,
    payment3Date: "",
    note: "",
  });
  assert.equal(next.ok, true);
  assert.equal(getState().sourcings.at(-1)!.sequence, 3);
});

test("legacy sourcing records migrate to the standalone payment structure", () => {
  const legacy = {
    ...seedBusinessState(),
    sourcings: [{
      id: "legacy-sourcing",
      batchId: "batch-42",
      date: "2026-06-12",
      sourceType: "SUPPLIER",
      sourceName: "CV Lama",
      productName: "Udang",
      quantity: 10,
      unit: "kg",
      unitCost: 72000,
      totalCost: 720000,
      paidAmount: 300000,
      outstandingAmount: 420000,
      note: "Migrasi",
    }],
  };
  const migrated = normalizeBusinessState(legacy);
  assert.deepEqual(migrated.sourcings[0], {
    id: "legacy-sourcing",
    sequence: 1,
    date: "2026-06-12",
    sourceType: "SUPPLIER",
    name: "CV Lama",
    type: "Udang",
    weight: 10,
    unit: "kg",
    price: 72000,
    total: 720000,
    payment1: 300000,
    payment1Date: "2026-06-12",
    payment2: 0,
    payment2Date: "",
    payment3: 0,
    payment3Date: "",
    note: "Migrasi",
  });
  assert.equal(migrated.numberSequences?.SOURCING, 1);
});

test("standalone sourcing renders its fields without a batch column", () => {
  const { commands, getState } = memoryCommands();
  const html = renderToStaticMarkup(createElement(WorkspacePage, {
    module: "lapak",
    page: "Pengadaan",
    business: getState(),
    commands,
    onNotify: () => {},
  initialFormOpen: true,
  }));
  assert.doesNotMatch(html, /No \(otomatis\)/);
  assert.match(html, /Pembayaran 1 \(Rp\)/);
  assert.match(html, /Tanggal pembayaran 1/);
  assert.match(html, /Pembayaran 2 \(Rp\)/);
  assert.match(html, /Tanggal pembayaran 2/);
  assert.match(html, /Pembayaran 3 \(Rp\)/);
  assert.match(html, /Tanggal pembayaran 3/);
  assert.match(html, /Daftar pengadaan/);
  assert.doesNotMatch(html, /Pilih batch Lapak/);
  assert.doesNotMatch(html, /Batch Pasar Muara Baru/);
  const listing = renderToStaticMarkup(createElement(WorkspacePage, {
    module: "lapak",
    page: "Pengadaan",
    business: getState(),
    commands,
    onNotify: () => {},
  }));
  assert.match(listing, /sourcing-record-table/);
  assert.match(listing, />Edit<\/span>/);
  assert.match(listing, />Hapus<\/span>/);
  assert.match(listing, /payment-add-button/);
  assert.match(listing, /\+ Bayar/);
  assert.match(listing, /<th>Pembayaran 1 \(Rp\)<\/th>/);
  assert.doesNotMatch(listing, /<th>No<\/th>/);
  assert.doesNotMatch(listing, /sourcing-record"/);
});

test("sourcing payments are updated inline and cannot exceed the purchase total", () => {
  const { commands, getState } = memoryCommands();
  const id = getState().sourcings[0].id;
  assert.equal(commands.updateSourcingPayment(id, 2, { amount: 500000, date: "2026-06-13" }).ok, true);
  assert.equal(getState().sourcings[0].payment2, 500000);
  assert.equal(getState().sourcings[0].payment2Date, "2026-06-13");
  assert.equal(commands.updateSourcingPayment(id, 3, { amount: 500000, date: "2026-06-14" }).ok, false);
  assert.equal(commands.updateSourcingPayment(id, 2, { amount: 100000, date: "" }).ok, false);
  assert.equal(commands.updateSourcingPayment(id, 2, { amount: 100000, date: "2026-06-11" }).ok, false);
  assert.equal(commands.updateSourcingPayment(id, 2, { amount: 0, date: "" }).ok, true);
  assert.equal(getState().sourcings[0].payment2, 0);
  assert.equal(getState().sourcings[0].payment2Date, "");
});

test("lapak sales require a customer and post a three-stage ledger", () => {
  const { commands, getState } = memoryCommands();
  const sale = { date: "2026-06-13", customerName: "Sri Sita", productName: "Udang", quantity: 2, unit: "kg", sellingPrice: 90000, unitCost: 70000 };
  assert.equal(commands.addLapakSale({ ...sale, customerName: "  " }).ok, false);
  assert.equal(commands.addLapakSale({ ...sale, payment1: 50000, payment1Date: "" }).ok, false);
  assert.equal(commands.addLapakSale(sale).ok, true);
  const created = getState().lapakSales.at(-1)!;
  assert.equal(created.customerName, "Sri Sita");
  assert.equal(created.totalAmount, 180000);
  assert.equal(commands.updateLapakSalePayment(created.id, 1, { amount: 80000, date: "2026-06-14" }).ok, true);
  assert.equal(commands.updateLapakSalePayment(created.id, 2, { amount: 200000, date: "2026-06-15" }).ok, false);
  assert.equal(getState().lapakSales.at(-1)!.payment1, 80000);
  const html = renderToStaticMarkup(createElement(WorkspacePage, { module: "lapak", page: "Penjualan", business: getState(), commands, onNotify: () => {} }));
  assert.match(html, /Tagihan per customer/);
  assert.match(html, /Sri Sita/);
  assert.match(html, /<th[^>]*>No<\/th>/);
  assert.match(html, /<th[^>]*>Nama<\/th>/);
  assert.match(html, /<th[^>]*>Kredit<\/th>/);
  assert.match(html, /<th[^>]*>Debit<\/th>/);
  assert.match(html, /<th[^>]*>Restan<\/th>/);
  assert.match(html, /Rp 80\.000/);
  assert.match(html, /Rp 100\.000/);
});

test("the sales page keeps the invoice book visible when the entry form opens", () => {
  const { commands, getState } = memoryCommands();
  const closed = renderToStaticMarkup(createElement(WorkspacePage, { module: "lapak", page: "Penjualan", business: getState(), commands, onNotify: () => {} }));
  assert.match(closed, /Tagihan per customer/);
  assert.doesNotMatch(closed, /Catat penjualan baru/);
  const open = renderToStaticMarkup(createElement(WorkspacePage, { module: "lapak", page: "Penjualan", business: getState(), commands, onNotify: () => {}, initialFormOpen: true }));
  // The form renders on the page; the ledger underneath must stay rendered and no backdrop may cover it.
  assert.match(open, /Tagihan per customer/);
  assert.match(open, /Catat penjualan baru/);
  assert.match(open, /form-modal-inline/);
  assert.doesNotMatch(open, /modal-backdrop/);
});

test("legacy lapak sales migrate to named customers with their payments intact", () => {
  const initial = seedBusinessState();
  const legacy = {
    ...initial,
    lapakSales: [
      { id: "legacy-sale", batchId: "batch-42", date: "2026-06-12", customerLabel: "B2C", paymentStatus: "PAID", totalAmount: 180000, items: [{ productName: "Udang", quantity: 2, unit: "kg", sellingPrice: 90000, unitCost: 70000, subtotal: 180000, costTotal: 140000, profit: 40000 }] },
      { id: "named-sale", batchId: "batch-42", date: "2026-06-12", customerLabel: "Bu Ani", paymentStatus: "PAID", totalAmount: 60000, items: [{ productName: "Cumi", quantity: 1, unit: "kg", sellingPrice: 60000, unitCost: 40000, subtotal: 60000, costTotal: 40000, profit: 20000 }] },
    ],
  };
  const migrated = normalizeBusinessState(legacy);
  assert.equal(migrated.lapakSales[0].customerName, "—");
  assert.equal(migrated.lapakSales[0].payment1, 180000);
  assert.equal(migrated.lapakSales[0].payment1Date, "2026-06-12");
  assert.equal(migrated.lapakSales[1].customerName, "Bu Ani");
  assert.equal("customerLabel" in migrated.lapakSales[0], false);
  assert.equal("paymentStatus" in migrated.lapakSales[0], false);
  // Sales no longer belong to a batch; the legacy link is dropped on migration.
  assert.equal("batchId" in migrated.lapakSales[0], false);
});

test("lapak sales stand alone and batch detail only lists commission and expenses", () => {
  const { commands, getState } = memoryCommands();
  const sale = commands.addLapakSale({ date: "2026-06-13", customerName: "Sri Sita", productName: "Udang", quantity: 2, unit: "kg", sellingPrice: 90000, unitCost: 70000 });
  assert.equal(sale.ok, true);
  assert.equal("batchId" in getState().lapakSales.at(-1)!, false);
  // Deleting a batch must not remove standalone sales.
  const batch = commands.createBatch({ startDate: "2026-06-13", notes: "Uji" });
  assert.equal(commands.deleteBatch(batch.id!).ok, true);
  assert.equal(getState().lapakSales.length, 1);

  const detail = renderToStaticMarkup(createElement(WorkspacePage, { module: "lapak", page: "Batch", business: getState(), commands, onNotify: () => {}, initialBatchId: "batch-42" }));
  assert.doesNotMatch(detail, /Penjualan B2C/);
  assert.match(detail, /Komisi/);
  assert.match(detail, /Pengeluaran/);

  const form = renderToStaticMarkup(createElement(WorkspacePage, { module: "lapak", page: "Penjualan", business: getState(), commands, onNotify: () => {}, initialFormOpen: true }));
  assert.doesNotMatch(form, /Batch Id/);
  assert.match(form, /Customer/);
});

test("batch note edits preserve the number even when there are several batches on a date", () => {
  const { commands, getState } = memoryCommands();
  const first = commands.createBatch({ startDate: "2026-11-11", notes: "Awal" });
  commands.createBatch({ startDate: "2026-11-11", notes: "Kedua" });
  const number = getState().batches.find((batch) => batch.id === first.id)!.batchNumber;
  assert.equal(commands.updateBatch(first.id!, { startDate: "2026-11-11", notes: "Koreksi" }).ok, true);
  assert.equal(getState().batches.find((batch) => batch.id === first.id)!.batchNumber, number);
});

test("batch numbers do not collide after deleting a middle or highest record", () => {
  const { commands, getState } = memoryCommands();
  const first = commands.createBatch({ startDate: "2026-11-11", notes: "" });
  const middle = commands.createBatch({ startDate: "2026-11-11", notes: "" });
  const highest = commands.createBatch({ startDate: "2026-11-11", notes: "" });
  commands.deleteBatch(middle.id!);
  commands.deleteBatch(highest.id!);
  const next = commands.createBatch({ startDate: "2026-11-11", notes: "" });
  assert.equal(getState().batches.find((batch) => batch.id === next.id)!.batchNumber, "BAT-111126-004");
  commands.deleteBatch(first.id!);
  commands.deleteBatch(next.id!);
  commands.createBatch({ startDate: "2026-11-11", notes: "" });
  assert.equal(getState().batches.at(-1)!.batchNumber, "BAT-111126-005");
});

test("moving a batch date reserves a unique number and retains the old high-water mark", () => {
  const { commands, getState } = memoryCommands();
  const first = commands.createBatch({ startDate: "2026-11-11", notes: "" });
  commands.createBatch({ startDate: "2026-11-12", notes: "" });
  commands.updateBatch(first.id!, { startDate: "2026-11-12", notes: "Pindah" });
  assert.equal(getState().batches.find((batch) => batch.id === first.id)!.batchNumber, "BAT-121126-002");
  commands.createBatch({ startDate: "2026-11-11", notes: "" });
  assert.equal(getState().batches.at(-1)!.batchNumber, "BAT-111126-002");
});

test("legacy document numbers are used as maxima, not record counts", () => {
  const initial = seedBusinessState();
  initial.batches[0].batchNumber = "BAT-100626-019";
  initial.invoices[0].invoiceNumber = "INV/2026/06/0980";
  const { commands, getState } = memoryCommands(initial);
  commands.createBatch({ startDate: "2026-06-10", notes: "" });
  commands.createInvoice(invoiceInput);
  assert.equal(getState().batches.at(-1)!.batchNumber, "BAT-100626-020");
  assert.equal(getState().invoices.at(-1)!.invoiceNumber, "INV/2026/06/0981");
  assert.equal(getState().invoices.at(-1)!.dueDate, "2026-06-26");
});

test("number reservations survive reload and deletion", () => {
  const fixture = storageFixture();
  const result = fixture.commands.createBatch({ startDate: "2026-11-11", notes: "" });
  fixture.commands.deleteBatch(result.id!);
  const restored = memoryCommands(normalizeBusinessState(JSON.parse(fixture.saved()!)));
  restored.commands.createBatch({ startDate: "2026-11-11", notes: "" });
  assert.equal(restored.getState().batches.at(-1)!.batchNumber, "BAT-111126-002");
});

test("invoice and receipt counters survive removal and advance independently per month", () => {
  const fixture = storageFixture();
  fixture.commands.receiveStock(receiptInput);
  fixture.commands.createInvoice(invoiceInput);
  fixture.store.update((state) => ({ ...state, receipts: [], invoices: state.invoices.filter((invoice) => invoice.invoiceNumber !== "INV/2026/06/0129") }));
  const restored = memoryCommands(normalizeBusinessState(JSON.parse(fixture.saved()!)));
  restored.commands.receiveStock(receiptInput);
  restored.commands.createInvoice(invoiceInput);
  assert.equal(restored.getState().receipts.at(-1)!.receiptNumber, "RCV/2026/11/0002");
  assert.equal(restored.getState().invoices.at(-1)!.invoiceNumber, "INV/2026/06/0130");
  restored.commands.receiveStock({ ...receiptInput, date: "2026-12-01" });
  restored.commands.createInvoice({ ...invoiceInput, date: "2026-12-01", dueDate: "2026-12-15" });
  assert.equal(restored.getState().receipts.at(-1)!.receiptNumber, "RCV/2026/12/0001");
  assert.equal(restored.getState().invoices.at(-1)!.invoiceNumber, "INV/2026/12/0001");
});

test("receipt payments produce Resto debt without affecting Lapak sourcing", () => {
  const { commands, getState } = memoryCommands();
  const sourcing = getState().sourcings;
  assert.equal(commands.receiveStock(receiptInput).ok, true);
  assert.equal(receiptOutstanding(getState().receipts[0]), 75000);
  assert.equal(getState().receipts[0].receiptNumber, "RCV/2026/11/0001");
  assert.equal(getState().products[0].stockBalance, 18);
  assert.equal(getState().sourcings, sourcing);
  commands.receiveStock({ ...receiptInput, paidAmount: 100000 });
  assert.equal(receiptOutstanding(getState().receipts[1]), 0);
  commands.receiveStock({ ...receiptInput, paidAmount: 0 });
  assert.equal(receiptOutstanding(getState().receipts[2]), 100000);
});

test("supplier overpayments and negative payments never change stock or HPP", () => {
  const { commands, getState } = memoryCommands();
  const initial = getState();
  for (const paidAmount of [-1, 100001, NaN, Infinity]) {
    assert.equal(commands.receiveStock({ ...receiptInput, paidAmount }).ok, false);
    assert.equal(getState(), initial);
  }
});

test("legacy receipts retain unknown payment information rather than inventing debt", () => {
  const { commands, getState } = memoryCommands();
  commands.receiveStock(receiptInput);
  delete getState().receipts[0].paidAmount;
  const migrated = normalizeBusinessState(JSON.parse(JSON.stringify(getState())));
  assert.equal(receiptOutstanding(migrated.receipts[0]), null);
  assert.equal(migrated.receipts[0].paidAmount, undefined);
});

test("Resto quick-entry and regular forms resolve to the Resto expense form", () => {
  assert.equal(resolveWorkspacePage("resto", "Expenses"), "Operating Expenses");
  assert.equal(resolveWorkspacePage("lapak", "Pengeluaran"), "Expenses");
  assert.equal(resolveWorkspacePage("lapak", "Batch"), "Batches");
  assert.equal(resolveWorkspacePage("resto", "Invoices"), "Invoices");
  const { commands, getState } = memoryCommands();
  const html = renderToStaticMarkup(createElement(WorkspacePage, { module: "resto", page: "Expenses", business: getState(), commands, onNotify: () => {}, initialFormOpen: true }));
  assert.match(html, /Operating Expenses/);
  assert.match(html, /Kategori/);
  assert.doesNotMatch(html, /Batch Id|Expense Name|Tambah item/);
  const lapak = getState().lapakExpenses;
  commands.addOperatingExpense({ date: "2026-11-11", category: "Logistik", description: "Bensin", amount: 10000 });
  assert.equal(getState().lapakExpenses, lapak);
  assert.equal(getState().operatingExpenses.at(-1)!.description, "Bensin");
});

test("batch list shows each batch's name and income/cost totals without CRUD meta cards", () => {
  const { commands, getState } = memoryCommands();
  const html = renderToStaticMarkup(
    createElement(WorkspacePage, {
      module: "lapak",
      page: "Batch",
      business: getState(),
      commands,
      onNotify: () => {},
    }),
  );

  assert.match(html, /BAT-100626-001/);
  assert.match(html, /Batch Pasar Muara Baru/);
  assert.match(html, /Rp 4\.200\.000/);
  assert.match(html, /Rp 420\.000/);
  assert.doesNotMatch(html, /Rp 3\.876\.000/);
  assert.match(html, /Pendapatan/);
  assert.match(html, /Biaya/);
  assert.doesNotMatch(html, /Mode data|CRUD|terhubung ke batch/);
});

test("Payables renders receipt debt and verification status, never Lapak sourcing", () => {
  const { commands, getState } = memoryCommands();
  commands.receiveStock(receiptInput);
  commands.receiveStock({ ...receiptInput, paidAmount: 100000 });
  delete getState().receipts[1].paidAmount;
  const html = renderToStaticMarkup(createElement(WorkspacePage, { module: "resto", page: "Payables", business: getState(), commands, onNotify: () => {} }));
  assert.match(html, /RCV\/2026\/11\/0001/);
  assert.match(html, /75\.000/);
  assert.match(html, /Belum diketahui/);
  assert.match(html, /Perlu verifikasi/);
  assert.match(html, /Catat penerimaan stok/);
  assert.doesNotMatch(html, /956\.000|Catat payable/);
});

test("a failed write returns failure, preserves disk and memory, and can be retried", () => {
  const fixture = storageFixture();
  const before = fixture.store.getSnapshot().state;
  const raw = fixture.saved();
  fixture.fail(true);
  const result = fixture.commands.createInvoice(invoiceInput);
  assert.equal(result.ok, false);
  assert.match(result.message, /belum disimpan/);
  assert.equal(fixture.saved(), raw);
  assert.equal(fixture.store.getSnapshot().state, before);
  assert.ok(fixture.store.getSnapshot().storageError);
  fixture.fail(false);
  assert.equal(fixture.commands.createInvoice(invoiceInput).ok, true);
  assert.equal(fixture.store.getSnapshot().state.products[0].stockBalance, 7);
  assert.equal(fixture.store.getSnapshot().state.invoices.length, before.invoices.length + 1);
  assert.equal(fixture.store.getSnapshot().storageError, null);
});

test("failed batch saves do not consume numbers or return a created id", () => {
  const fixture = storageFixture();
  fixture.fail(true);
  const failed = fixture.commands.createBatch({ startDate: "2026-11-11", notes: "" });
  assert.equal(failed.ok, false);
  assert.equal(failed.id, undefined);
  fixture.fail(false);
  fixture.commands.createBatch({ startDate: "2026-11-11", notes: "" });
  assert.equal(fixture.store.getSnapshot().state.batches.at(-1)!.batchNumber, "BAT-111126-001");
});

test("failed receipts and payments preserve stock, HPP, debts, and invoice balances", () => {
  const fixture = storageFixture();
  const initial = fixture.store.getSnapshot().state;
  fixture.fail(true);
  assert.equal(fixture.commands.receiveStock(receiptInput).ok, false);
  assert.equal(fixture.store.getSnapshot().state, initial);
  assert.equal(fixture.commands.addPayment({ invoiceId: "invoice-127", date: "2026-11-11", amount: 100000, method: "Tunai", reference: "" }).ok, false);
  assert.equal(fixture.store.getSnapshot().state, initial);
  assert.equal(fixture.writes(), 0);
});

test("arithmetic overflow cannot be persisted as null amounts", () => {
  const fixture = storageFixture();
  const initial = fixture.store.getSnapshot().state;
  const result = fixture.commands.receiveStock({ ...receiptInput, unitPurchasePrice: Number.MAX_VALUE });
  assert.equal(result.ok, false);
  assert.equal(fixture.store.getSnapshot().state, initial);
  assert.equal(fixture.writes(), 0);
});

test("corrupt JSON or malformed records are preserved and block all writes", () => {
  const invalidStates = ["{broken", "null", "{}", JSON.stringify({ ...seedBusinessState(), invoices: null }), JSON.stringify({ ...seedBusinessState(), products: [{ id: "broken" }] })];
  for (const raw of invalidStates) {
    const fixture = storageFixture(raw);
    assert.ok(fixture.store.getSnapshot().storageError);
    assert.equal(fixture.commands.createBatch({ startDate: "2026-11-11", notes: "" }).ok, false);
    assert.equal(fixture.saved(), raw);
    assert.equal(fixture.writes(), 0);
  }
});

test("unavailable storage blocks writing, and retry recovers without resetting records", () => {
  let unavailable = true;
  let raw: string | null = JSON.stringify(seedBusinessState());
  const store = createLocalBusinessStore(() => {
    if (unavailable) throw new Error("SecurityError");
    return { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
  });
  assert.ok(store.getSnapshot().storageError);
  unavailable = false;
  store.reload();
  assert.equal(store.getSnapshot().storageError, null);
  assert.equal(store.getSnapshot().state.invoices.length, 2);
});

test("legacy batches lose lifecycle fields without losing their transactions", () => {
  const initial = seedBusinessState();
  const legacy = { ...initial, batches: initial.batches.map((batch) => ({ ...batch, status: "CLOSED", closedDate: "2026-11-11" })) };
  const normalized = normalizeBusinessState(legacy);
  assert.equal("status" in normalized.batches[0], false);
  assert.equal("closedDate" in normalized.batches[0], false);
  assert.equal(normalized.commissions, initial.commissions);
  assert.equal(normalized.sourcings, initial.sourcings);
});

test("a multi-item save commits once and cannot leave a partial transaction", () => {
  const fixture = storageFixture();
  const initial = fixture.store.getSnapshot().state;
  fixture.fail(true);
  const save = () => fixture.commands.runTransaction((commands) => {
    const first = commands.addLapakExpense(expenseInput);
    if (!first.ok) return first;
    return commands.addLapakExpense({ ...expenseInput, expenseName: "Transport" });
  });
  assert.equal(save().ok, false);
  assert.equal(fixture.store.getSnapshot().state, initial);
  fixture.fail(false);
  assert.equal(save().ok, true);
  assert.equal(fixture.writes(), 1);
  assert.equal(fixture.store.getSnapshot().state.lapakExpenses.length, initial.lapakExpenses.length + 2);
});

test("invalid later items abort the whole transaction", () => {
  const fixture = storageFixture();
  const initial = fixture.store.getSnapshot().state;
  const result = fixture.commands.runTransaction((commands) => {
    commands.addLapakExpense(expenseInput);
    return commands.addLapakExpense({ ...expenseInput, amount: -1 });
  });
  assert.equal(result.ok, false);
  assert.equal(fixture.writes(), 0);
  assert.equal(fixture.store.getSnapshot().state, initial);
});

test("stale tabs do not overwrite newer data, and retry uses the latest state", () => {
  const fixture = storageFixture();
  fixture.store.getSnapshot();
  const latest = seedBusinessState();
  latest.operatingExpenses.push({ id: "external", date: "2026-11-11", category: "Es", description: "Tab lain", amount: 1000 });
  fixture.externalWrite(JSON.stringify(latest));
  const result = fixture.commands.addLapakExpense(expenseInput);
  assert.equal(result.ok, false);
  assert.match(result.message, /tab lain/);
  assert.equal(fixture.writes(), 0);
  assert.equal(fixture.store.getSnapshot().state.operatingExpenses.at(-1)!.id, "external");
  assert.equal(fixture.commands.addLapakExpense(expenseInput).ok, true);
  const persisted = JSON.parse(fixture.saved()!) as BusinessState;
  assert.equal(persisted.operatingExpenses.at(-1)!.id, "external");
});

test("an external corrupt write retains last known records and blocks overwrite", () => {
  const fixture = storageFixture();
  const before = fixture.store.getSnapshot().state;
  fixture.externalWrite("{broken");
  fixture.store.reload();
  assert.equal(fixture.store.getSnapshot().state, before);
  assert.equal(fixture.commands.addLapakExpense(expenseInput).ok, false);
  assert.equal(fixture.saved(), "{broken");
});

test("fully discounted invoices are paid and online orders never retain a restaurant link", () => {
  const { commands, getState } = memoryCommands();
  assert.equal(commands.createInvoice({ ...invoiceInput, channel: "ONLINE", dueDate: invoiceInput.date, discount: 86000 }).ok, true);
  const invoice = getState().invoices.at(-1)!;
  assert.equal(invoice.status, "PAID");
  assert.equal(invoice.outstandingAmount, 0);
  assert.equal(invoice.restaurantId, undefined);
  assert.equal(invoice.dueDate, invoice.date);
});
