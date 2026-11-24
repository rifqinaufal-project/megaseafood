import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createBusinessCommands } from "../src/application/use-cases/business-commands";
import { formatRupiah, seedBusinessState, type BusinessState } from "../src/domain/business-state";
import { addCalendarDays, isBusinessDate, localDate, receiptOutstanding } from "../src/domain/business-integrity";
import WorkspacePage from "../src/presentation/dashboard/WorkspacePage";
import { buildLedgerGroups } from "../src/presentation/dashboard/TagihanWorkspace";
import { groupByMonth, inRange, periodLabel, periodRange, shiftDays, startOfWeek } from "../src/domain/lapak-periods";
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

const ledgerInput = { date: "2026-06-13", customerName: "Sri Sita", kind: "KREDIT" as const, amount: 180000, note: "Udang 2 kg" };
const renderPenjualan = (commands: ReturnType<typeof memoryCommands>["commands"], getState: () => BusinessState, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(WorkspacePage, { module: "lapak", page: "Penjualan", business: getState(), commands, onNotify: () => {}, ...extra }));

test("lapak ledger rows need a customer, a kind and a positive amount", () => {
  const { commands, getState } = memoryCommands();
  assert.equal(commands.addLapakSale({ ...ledgerInput, customerName: "  " }).ok, false);
  assert.equal(commands.addLapakSale({ ...ledgerInput, amount: 0 }).ok, false);
  assert.equal(commands.addLapakSale({ ...ledgerInput, amount: -5000 }).ok, false);
  assert.equal(commands.addLapakSale({ ...ledgerInput, date: "13-06-2026" }).ok, false);
  assert.equal(commands.addLapakSale({ ...ledgerInput, kind: "LAIN" as "KREDIT" }).ok, false);
  assert.equal(commands.addLapakSale(ledgerInput).ok, true);
  const created = getState().lapakSales.at(-1)!;
  assert.equal(created.customerName, "Sri Sita");
  assert.equal(created.kind, "KREDIT");
  assert.equal(created.amount, 180000);
  assert.equal(created.note, "Udang 2 kg");
});

test("editing and deleting ledger rows keeps the restan recompute-able", () => {
  const { commands, getState } = memoryCommands();
  const credit = commands.addLapakSale(ledgerInput);
  const debit = commands.addLapakSale({ date: "2026-06-14", customerName: "Sri Sita", kind: "DEBIT", amount: 80000, note: "Transfer" });
  assert.equal(commands.addLapakSale({ date: "2026-06-15", customerName: "Sri Sita", kind: "DEBIT", amount: 200000 }).ok, true);
  assert.equal(commands.updateLapakSale(debit.id!, { ...ledgerInput, date: "2026-06-14", kind: "DEBIT", amount: 50000 }).ok, true);
  const row = getState().lapakSales.find((item) => item.id === debit.id)!;
  assert.equal(row.amount, 50000);
  assert.equal(row.kind, "DEBIT");
  assert.equal(row.note, "Udang 2 kg");
  assert.equal(commands.deleteLapakSale(credit.id!).ok, true);
  assert.equal(getState().lapakSales.some((item) => item.id === credit.id), false);
  assert.equal(commands.deleteLapakSale("missing").ok, false);
  // Every ledger mutation leaves an audit trail with the old and new state.
  const actions = new Set(getState().auditLogs.map((log) => log.action));
  assert.ok(actions.has("LAPAK_LEDGER_CREATED"));
  assert.ok(actions.has("LAPAK_LEDGER_UPDATED"));
  assert.ok(actions.has("LAPAK_LEDGER_DELETED"));
});

test("several ledger rows can be saved for one customer in a single step", () => {
  const { commands, getState } = memoryCommands();
  const before = getState().lapakSales.length;
  const result = commands.addLapakSaleEntries({
    customerName: "  Bu Ani ",
    entries: [
      { date: "2026-11-15", kind: "KREDIT", amount: 3277000 },
      { date: "2026-11-17", kind: "KREDIT", amount: 10744000 },
      { date: "2026-11-20", kind: "DEBIT", amount: 2000000, note: "Transfer BCA" },
    ],
  });
  assert.equal(result.ok, true);
  const rows = getState().lapakSales.slice(before);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.customerName === "Bu Ani"));
  assert.equal(rows.reduce((sum, row) => sum + (row.kind === "KREDIT" ? row.amount : -row.amount), 0), 12021000);
  assert.equal(commands.addLapakSaleEntries({ customerName: "Bu Ani", entries: [] }).ok, false);
  assert.equal(commands.addLapakSaleEntries({ customerName: "Bu Ani", entries: [{ date: "2026-11-15", kind: "KREDIT", amount: 0 }] }).ok, false);
});

test("the sales page is the Buku Tagihan: header, summary cards and the ledger table", () => {
  const { commands, getState } = memoryCommands();
  commands.addLapakSale(ledgerInput);
  const html = renderPenjualan(commands, getState);
  assert.match(html, /Home \/ Buku Tagihan/);
  assert.match(html, /<h1>Buku Tagihan<\/h1>/);
  assert.match(html, /Kelola transaksi kredit, debit, dan sisa tagihan pelanggan\./);
  assert.match(html, /Tambah Transaksi/);
  for (const card of ["Total Pelanggan", "Total Kredit", "Total Debit", "Total Restan"])
    assert.ok(html.includes(card), `the summary must show "${card}"`);
  assert.match(html, /Sri Sita/);
  // Dates read as "13 Jun 2026" instead of the raw ISO string.
  assert.match(html, /13 Jun 2026/);
  // The customer name is rendered as visible text only in the card header; rows and a11y labels differ.
  const header = html.slice(html.indexOf('class="ledger-customer"'), html.indexOf('class="ledger-customer-figures"'));
  assert.match(header, /<h3>Sri Sita<\/h3>/);
  assert.equal([...html.matchAll(/>Sri Sita</g)].length, 1);
  // The transaction row leads with the kind badge and note instead of repeating the name.
  assert.match(html, /<td class="ledger-name" data-label="Nama Pelanggan"><span class="ledger-badge ledger-badge-kredit">Kredit<\/span><small>Udang 2 kg<\/small><\/td>/);
  const headers = [...html.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((match) => match[1]);
  assert.deepEqual(headers, ["No", "Nama Pelanggan", "Tanggal", "Kredit", "Debit", "Restan", "Aksi"]);
  assert.match(html, /<td class="ledger-no" data-label="No">1<\/td>/);
  assert.match(html, /Rp 180\.000/);
  // The entry form only appears when the button is pressed.
  assert.doesNotMatch(html, /modal-backdrop/);
  assert.doesNotMatch(html, /Product Name/);
  assert.doesNotMatch(html, /Quantity/);
});

const groupRestans = (html: string) =>
  [...html.matchAll(/<td class="ledger-amount is-(?:open|settled)" data-label="Restan">(?:<strong>)?([^<]+)/g)].map((match) => match[1]);

test("each customer group shows a running restan and its current balance once", () => {
  const { commands, getState } = memoryCommands();
  commands.addLapakSaleEntries({
    customerName: "Pak Budi",
    entries: [
      { date: "2026-11-10", kind: "KREDIT", amount: 1000000 },
      { date: "2026-11-12", kind: "DEBIT", amount: 400000 },
      { date: "2026-11-14", kind: "KREDIT", amount: 250000 },
    ],
  });
  const html = renderPenjualan(commands, getState);
  // 1.000.000, then 600.000 after the payment, then 850.000 after the second credit.
  assert.deepEqual(groupRestans(html), ["Rp 1.000.000", "Rp 600.000", "Rp 850.000"]);
  // The customer header carries the totals, so the table no longer repeats them as a subtotal row.
  assert.doesNotMatch(html, /Subtotal Pak Budi/);
  // Header pelanggan menampilkan saldo sekali; header bulan punya angka aktivitas sendiri (lihat bawah).
  assert.equal([...html.matchAll(/<b class="is-open">Rp 850\.000<\/b>/g)].length, 1);
  assert.equal([...html.matchAll(/<b class="is-credit">Rp 1\.250\.000<\/b>/g)].length, 1);
  assert.equal([...html.matchAll(/<b class="is-debit">Rp 400\.000<\/b>/g)].length, 1);
  // Transaksi dikelompokkan per bulan, dengan subtotal kredit, debit, dan aktivitas bulan itu.
  assert.match(html, /<h2>November 2026<\/h2>/);
  assert.match(html, /1 pelanggan · 3 transaksi/);
  assert.equal([...html.matchAll(/<b class="is-credit">Rp 1\.250\.000<\/b>/g)].length, 1);
  // Header bulan hanya menambah total aktivitas, tanpa mengulang angka saldo pelanggan.
  assert.equal([...html.matchAll(/<b>Rp 1\.650\.000<\/b>/g)].length, 1);
});

test("filters narrow the visible rows but never slice the running restan", () => {
  const { commands, getState } = memoryCommands();
  commands.addLapakSaleEntries({
    customerName: "Pak Budi",
    entries: [
      { date: "2026-11-10", kind: "KREDIT", amount: 1000000 },
      { date: "2026-11-12", kind: "DEBIT", amount: 400000 },
    ],
  });
  // Only the payment is in period: its restan still comes from the earlier credit.
  commands.addLapakSaleEntries({
    customerName: "Lapak Pagi",
    entries: [{ date: "2026-11-01", kind: "KREDIT", amount: 500000 }],
  });
  const groups = buildLedgerGroups(getState().lapakSales);
  const filtered = groups
    .map((group) => ({ ...group, lines: group.lines.filter((line) => line.row.date >= "2026-11-11") }))
    .filter((group) => group.lines.length > 0);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].customerName, "Pak Budi");
  assert.deepEqual(filtered[0].lines.map((line) => line.restan), [600000]);
  // The customer header keeps the real current balance, not the filtered slice.
  assert.equal(filtered[0].restan, 600000);
  assert.equal(filtered[0].credit, 1000000);
});

test("the Tambah Transaksi dialog records kredit and debit in one customer", () => {
  const { commands, getState } = memoryCommands();
  const html = renderPenjualan(commands, getState, { initialFormOpen: true });
  assert.match(html, /<h2 id="ledger-form-title">Tambah Transaksi<\/h2>/);
  assert.match(html, /Restan transaksi/);
  assert.doesNotMatch(html, />Selisih</);
  for (const label of ["Pelanggan", "Jenis", "Nominal", "Keterangan", "Tambah Baris", "Simpan Transaksi", "Batal"])
    assert.ok(html.includes(label), `the form must show "${label}"`);
  assert.match(html, /<option value="KREDIT">Kredit<\/option>/);
  assert.match(html, /<option value="DEBIT">Debit<\/option>/);
  for (const legacy of ["Product Name", "Quantity", "Unit Cost", "HPP", "Tambah item", "Simpan 1 item"])
    assert.ok(!html.includes(legacy), `the ledger dialog must not show "${legacy}"`);
});

test("the ledger shows an informative empty state when nothing is recorded", () => {
  const { commands, getState } = memoryCommands({ ...seedBusinessState(), lapakSales: [] });
  const html = renderPenjualan(commands, getState);
  assert.match(html, /Belum ada transaksi buku tagihan/);
  // One primary action in the header, not a duplicate CTA inside the empty state.
  assert.equal([...html.matchAll(/Tambah Transaksi/g)].length, 1);
});

test("legacy lapak sales migrate to one kredit row plus one debit row per payment", () => {
  const initial = seedBusinessState();
  const legacy = {
    ...initial,
    lapakSales: [
      { id: "legacy-sale", batchId: "batch-42", date: "2026-06-12", customerLabel: "B2C", paymentStatus: "PAID", totalAmount: 180000, payment1: 100000, payment1Date: "2026-06-14", payment2: 0, payment2Date: "", payment3: 0, payment3Date: "", items: [{ productName: "Udang", quantity: 2, unit: "kg", sellingPrice: 90000, unitCost: 70000, subtotal: 180000, costTotal: 140000, profit: 40000 }] },
      { id: "named-sale", batchId: "batch-42", date: "2026-06-12", customerLabel: "Bu Ani", paymentStatus: "PAID", totalAmount: 60000, items: [{ productName: "Cumi", quantity: 1, unit: "kg", sellingPrice: 60000, unitCost: 40000, subtotal: 60000, costTotal: 40000, profit: 20000 }] },
    ],
  };
  const migrated = normalizeBusinessState(legacy);
  assert.deepEqual(
    migrated.lapakSales.map((row) => [row.id, row.customerName, row.kind, row.amount]),
    [
      ["legacy-sale-kredit", "—", "KREDIT", 180000],
      ["legacy-sale-debit-1", "—", "DEBIT", 100000],
      ["named-sale-kredit", "Bu Ani", "KREDIT", 60000],
    ],
  );
  assert.equal(migrated.lapakSales[1].date, "2026-06-14");
  assert.match(migrated.lapakSales[0].note, /Udang/);
  assert.equal("customerLabel" in migrated.lapakSales[0], false);
  assert.equal("paymentStatus" in migrated.lapakSales[0], false);
  assert.equal("batchId" in migrated.lapakSales[0], false);
  assert.equal("items" in migrated.lapakSales[0], false);
  // Restan of the old data is preserved: 180.000 - 100.000 and 60.000.
  const restan = migrated.lapakSales.reduce((sum, row) => sum + (row.kind === "KREDIT" ? row.amount : -row.amount), 0);
  assert.equal(restan, 140000);
});

test("period ranges follow the calendar without time-zone drift", () => {
  assert.deepEqual(periodRange("Harian", "2026-11-24"), { from: "2026-11-24", to: "2026-11-24" });
  // Senin–Minggu: 24 Nov 2026 jatuh pada Selasa, jadi minggunya mulai 23 November.
  assert.equal(startOfWeek("2026-11-24"), "2026-11-23");
  assert.deepEqual(periodRange("Mingguan", "2026-11-24"), { from: "2026-11-23", to: "2026-11-29" });
  assert.deepEqual(periodRange("Bulanan", "2026-02-10"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(periodRange("Bulanan", "2026-12-31"), { from: "2026-12-01", to: "2026-12-31" });
  assert.equal(periodRange("Semua", "2026-11-24"), null);
  assert.equal(shiftDays("2026-12-31", 1), "2027-01-01");
  assert.equal(periodLabel("Harian", "2026-11-24"), "Selasa, 24 November 2026");
  assert.equal(periodLabel("Mingguan", "2026-11-24"), "23–29 November 2026");
  assert.equal(periodLabel("Bulanan", "2026-11-24"), "November 2026");
  assert.equal(periodLabel("Semua", "2026-11-24"), "Semua periode");
  // Batas rentang inklusif di kedua ujung.
  const week = periodRange("Mingguan", "2026-11-24");
  assert.equal(inRange("2026-11-23", week), true);
  assert.equal(inRange("2026-11-29", week), true);
  assert.equal(inRange("2026-11-30", week), false);
});

test("every lapak page offers Harian, Mingguan, Bulanan, and Semua", () => {
  const { commands, getState } = memoryCommands();
  // Batch ikut memakai pemilih yang sama, termasuk halaman detail per batch.
  const batchId = getState().batches[0].id;
  const renders: [string, string, string | undefined][] = [
    ...["Tagihan", "Komisi", "Pengeluaran", "Pengadaan", "Batch"].map((page) => [page, page, undefined] as [string, string, string | undefined]),
    ["Batch detail", "Batch", batchId],
  ];
  for (const [label, page, initialBatchId] of renders) {
    const html = renderToStaticMarkup(createElement(WorkspacePage, { module: "lapak", page, business: getState(), commands, onNotify: () => {}, initialBatchId }));
    for (const option of ["Harian", "Mingguan", "Bulanan", "Semua"]) assert.match(html, new RegExp(`>${option}<`), `${label} tanpa pilihan ${option}`);
    // Memakai pemilih yang sama dengan Dashboard Lapak (.period-switcher), default "Semua".
    assert.match(html, /class="period-switcher"/, `${label} tidak memakai period-switcher`);
    assert.match(html, /class="active"[^>]*>Semua</, `${label} tidak default ke Semua`);
    assert.match(html, /Dikelompokkan per bulan/);
  }
});

test("batch list is grouped by month with the newest month first", () => {
  const { commands, getState } = memoryCommands({
    ...seedBusinessState(),
    batches: [
      { id: "b-sep", batchNumber: "BAT-SEP", startDate: "2026-09-02", notes: "Ikan" },
      { id: "b-okt", batchNumber: "BAT-OKT", startDate: "2026-10-05", notes: "Udang" },
    ],
    commissions: [],
    lapakExpenses: [],
  });
  commands.addCommission({ batchId: "b-okt", date: "2026-10-06", partner: "Juragan B", amount: 300000, note: "" });
  const html = renderToStaticMarkup(createElement(WorkspacePage, { module: "lapak", page: "Batch", business: getState(), commands, onNotify: () => {} }));
  assert.match(html, /<h2>Oktober 2026<\/h2>/);
  assert.match(html, /<h2>September 2026<\/h2>/);
  assert.ok(html.indexOf("Oktober 2026") < html.indexOf("September 2026"));
  assert.match(html, /2 batch · 2 bulan/);
  // Subtotal pendapatan per bulan ikut tampil.
  assert.match(html, /Rp 300\.000/);
});

test("month grouping puts the newest month first and keeps undated rows last", () => {
  const grouped = groupByMonth(
    [
      { date: "2026-10-02", amount: 1000 },
      { date: "2026-11-20", amount: 2000 },
      { date: "2026-10-25", amount: 500 },
      { date: "", amount: 300 },
      { date: "2025-12-31", amount: 700 },
    ],
    (item) => item.date,
    (item) => item.amount,
  );
  assert.deepEqual(grouped.map((month) => month.label), ["November 2026", "Oktober 2026", "Desember 2025", "Tanpa tanggal"]);
  assert.equal(grouped[0].total, 2000);
  assert.equal(grouped[1].total, 1500);
  assert.equal(grouped[1].items.length, 2);
});

test("komisi and pengeluaran are grouped by month with a monthly subtotal", () => {
  const { commands, getState } = memoryCommands();
  const batch = getState().batches[0];
  commands.addCommission({ batchId: batch.id, date: "2026-09-05", partner: "Juragan A", amount: 250000, note: "" });
  commands.addCommission({ batchId: batch.id, date: "2026-10-08", partner: "Juragan B", amount: 400000, note: "" });
  commands.addLapakExpense({ batchId: batch.id, date: "2026-10-09", expenseName: "Es batu", amount: 75000, notes: "" });
  commands.addLapakExpense({ batchId: batch.id, date: "2026-09-21", expenseName: "Solar", amount: 120000, notes: "" });

  const commission = renderToStaticMarkup(createElement(WorkspacePage, { module: "lapak", page: "Komisi", business: getState(), commands, onNotify: () => {} }));
  assert.match(commission, /<h2>Oktober 2026<\/h2>/);
  assert.match(commission, /<h2>September 2026<\/h2>/);
  // Bulan terbaru tampil lebih dulu.
  assert.ok(commission.indexOf("Oktober 2026") < commission.indexOf("September 2026"));
  // Nama batch tetap terbaca sebagai metadata, walau urutan halaman mengikuti bulan.
  assert.ok(commission.includes(batch.batchNumber));

  const expenses = renderToStaticMarkup(createElement(WorkspacePage, { module: "lapak", page: "Pengeluaran", business: getState(), commands, onNotify: () => {} }));
  assert.match(expenses, /<h2>Oktober 2026<\/h2>/);
  assert.match(expenses, /<h2>September 2026<\/h2>/);
  assert.match(expenses, /Solar/);
});

test("pengadaan is grouped by month with its own paid and outstanding subtotal", () => {
  // Data uji berdiri sendiri; catatan seed tidak ikut supaya urutan bulan tidak tercampur.
  const { commands, getState } = memoryCommands({ ...seedBusinessState(), sourcings: [] });
  const sourcing = (date: string, name: string, price: number, weight: number) => ({
    date, sourceType: "SUPPLIER" as const, name, type: "Ikan", weight, unit: "kg", price,
    payment1: 0, payment1Date: "", payment2: 0, payment2Date: "", payment3: 0, payment3Date: "", note: "",
  });
  commands.addSourcing(sourcing("2026-09-11", "Ikan Kerapu", 50000, 10));
  const october = commands.addSourcing(sourcing("2026-10-11", "Udang", 90000, 5));
  assert.equal(october.ok, true);
  commands.updateSourcingPayment(october.id!, 1, { amount: 200000, date: "2026-10-12" });

  const html = renderToStaticMarkup(createElement(WorkspacePage, { module: "lapak", page: "Pengadaan", business: getState(), commands, onNotify: () => {} }));
  assert.match(html, /<h2>Oktober 2026<\/h2>/);
  assert.match(html, /<h2>September 2026<\/h2>/);
  assert.ok(html.indexOf("Oktober 2026") < html.indexOf("September 2026"));
  assert.match(html, /2 bulan/);
});

test("lapak ledger rows stand alone and batch detail only lists commission and expenses", () => {
  const { commands, getState } = memoryCommands();
  const sale = commands.addLapakSale(ledgerInput);
  assert.equal(sale.ok, true);
  assert.equal("batchId" in getState().lapakSales.at(-1)!, false);
  // Deleting a batch must not remove ledger rows.
  const batch = commands.createBatch({ startDate: "2026-06-13", notes: "Uji" });
  assert.equal(commands.deleteBatch(batch.id!).ok, true);
  assert.equal(getState().lapakSales.length, 1);

  const detail = renderToStaticMarkup(createElement(WorkspacePage, { module: "lapak", page: "Batch", business: getState(), commands, onNotify: () => {}, initialBatchId: "batch-42" }));
  assert.doesNotMatch(detail, /Penjualan B2C/);
  assert.match(detail, /Komisi/);
  assert.match(detail, /Pengeluaran/);
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
