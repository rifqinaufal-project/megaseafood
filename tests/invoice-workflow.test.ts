import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createBusinessCommands } from "../src/application/use-cases/business-commands";
import { seedBusinessState, type Invoice } from "../src/domain/business-state";
import {
  calculateInvoice,
  defaultDueDate,
  type InvoiceInput,
} from "../src/domain/invoice";
import {
  createLocalBusinessStore,
  normalizeBusinessState,
} from "../src/infrastructure/repositories/local-business-store";
import WorkspacePage from "../src/presentation/dashboard/WorkspacePage";

const line = {
  productId: "product-1",
  quantity: 2,
  marginQuantity: 0.5,
  sellingPrice: 86000,
};
const input: InvoiceInput = {
  channel: "ONLINE",
  restaurantId: "",
  customerName: "Pelanggan uji",
  date: "2026-11-11",
  dueDate: "2026-11-11",
  items: [line],
  discount: 10000,
};
const paymentInput = {
  date: "2026-11-11",
  amount: 50000,
  method: "Transfer",
  reference: "TRF-01",
};
function fixture() {
  let raw = JSON.stringify(seedBusinessState());
  let fail = false;
  let writes = 0;
  const store = createLocalBusinessStore(() => ({
    getItem: () => raw,
    setItem: (_key, value) => {
      if (fail) throw new Error("quota");
      raw = value;
      writes++;
    },
  }));
  const commands = createBusinessCommands(
    store.update,
    () => store.getSnapshot().state,
  );
  const getState = () => store.getSnapshot().state;
  const create = (value: InvoiceInput = input) => {
    const result = commands.createInvoice(value);
    assert.equal(result.ok, true, result.message);
    return getState().invoices.find((invoice) => invoice.id === result.id)!;
  };
  return {
    store,
    commands,
    getState,
    create,
    fail: (value: boolean) => {
      fail = value;
    },
    raw: () => raw,
    writes: () => writes,
  };
}
function editable(invoice: Invoice): InvoiceInput {
  return {
    channel: invoice.salesChannel,
    restaurantId: invoice.restaurantId ?? "",
    customerName: invoice.customerName,
    date: invoice.date,
    dueDate: invoice.dueDate,
    discount: invoice.discount,
    expectedRevision: invoice.revision ?? 0,
    items: invoice.items.map((item) => ({
      productId: item.productId,
      quantity: item.stockQuantity,
      marginQuantity: item.marginQuantity,
      sellingPrice: item.sellingPrice,
    })),
  };
}
const approximately = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test("multi-product preview is pure and matches the single atomic save", () => {
  const f = fixture();
  const before = f.getState();
  const value = {
    ...input,
    items: [
      line,
      {
        productId: "product-2",
        quantity: 1.25,
        marginQuantity: 0,
        sellingPrice: 32000,
      },
    ],
  };
  const preview = calculateInvoice(before, value);
  assert.equal(preview.ok, true);
  assert.equal(f.getState(), before);
  assert.equal(preview.subtotal, 255000);
  assert.equal(preview.total, 245000);
  const invoice = f.create(value);
  assert.equal(f.writes(), 1);
  assert.deepEqual(invoice.items, preview.items);
  assert.equal(invoice.total, preview.total);
  assert.equal(f.getState().products[0].stockBalance, 6);
  assert.equal(f.getState().products[1].stockBalance, 2.75);
  assert.equal(invoice.items[0].billingQuantity, 2.5);
  assert.equal(invoice.items[0].hppTotal, 144000);
});

test("duplicate product lines share stock validation and cannot partially save", () => {
  const f = fixture();
  const before = f.getState();
  const result = f.commands.createInvoice({
    ...input,
    items: [
      { ...line, quantity: 5 },
      { ...line, quantity: 4 },
    ],
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /tersedia/);
  assert.equal(f.getState(), before);
  assert.equal(f.writes(), 0);
  const invoice = f.create({
    ...input,
    items: [
      { ...line, quantity: 4 },
      { ...line, quantity: 4 },
    ],
  });
  assert.equal(invoice.items.length, 2);
  assert.equal(f.getState().products[0].stockBalance, 0);
});

test("empty items, invalid dates, amounts, quantities and inactive products are rejected", () => {
  const f = fixture();
  const before = f.getState();
  const invalid: InvoiceInput[] = [
    { ...input, items: [] },
    { ...input, customerName: "  " },
    { ...input, dueDate: "2026-11-10" },
    { ...input, dueDate: "2026-02-30" },
    { ...input, channel: "RESTAURANT", restaurantId: "missing" },
    { ...input, discount: -1 },
    { ...input, discount: 0.5 },
    { ...input, discount: 9999999 },
    ...[0, -1, NaN, Infinity].map((quantity) => ({
      ...input,
      items: [{ ...line, quantity }],
    })),
    ...[-1, NaN, Infinity].map((marginQuantity) => ({
      ...input,
      items: [{ ...line, marginQuantity }],
    })),
    ...[0, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER].map((sellingPrice) => ({
      ...input,
      items: [{ ...line, sellingPrice }],
    })),
    { ...input, items: [{ ...line, productId: "missing" }] },
  ];
  for (const value of invalid)
    assert.equal(f.commands.createInvoice(value).ok, false);
  assert.equal(f.getState(), before);
  assert.equal(f.writes(), 0);
  const state = structuredClone(before);
  state.products[0].status = "INACTIVE";
  assert.equal(calculateInvoice(state, input).ok, false);
});

test("fractional quantities round each bill line to whole Rupiah, not stock quantities", () => {
  const f = fixture();
  const invoice = f.create({
    ...input,
    items: [
      { ...line, quantity: 0.3333, marginQuantity: 0, sellingPrice: 10001 },
    ],
    discount: 0,
  });
  assert.equal(invoice.total, 3333);
  assert.equal(f.getState().products[0].stockBalance, 7.6667);
  assert.equal(defaultDueDate("2026-12-31", 14), "2027-01-14");
});

test("invoice correction preserves number and payments while applying only stock differences", () => {
  const f = fixture();
  const original = f.create();
  assert.equal(
    f.commands.addPayment({ ...paymentInput, invoiceId: original.id }).ok,
    true,
  );
  const invoice = f.getState().invoices.at(-1)!;
  const value = {
    ...editable(invoice),
    customerName: "Koreksi",
    date: "2026-11-01",
    items: [{ ...line, quantity: 3 }],
  };
  assert.equal(f.commands.updateInvoice(invoice.id, value).ok, true);
  const updated = f.getState().invoices.at(-1)!;
  assert.equal(updated.invoiceNumber, original.invoiceNumber);
  assert.equal(updated.paidAmount, 50000);
  assert.equal(updated.total, 291000);
  assert.equal(updated.outstandingAmount, 241000);
  assert.equal(updated.status, "PARTIALLY_PAID");
  assert.equal(f.getState().payments.length, 1);
  assert.equal(f.getState().products[0].stockBalance, 5);
});

test("historical HPP survives restocking and added quantities use current HPP", () => {
  const f = fixture();
  const invoice = f.create();
  assert.equal(
    f.commands.receiveStock({
      supplierId: "supplier-1",
      date: input.date,
      productId: "product-1",
      manualWeight: 6,
      digitalWeight: 6,
      unitPurchasePrice: 120000,
      paidAmount: 0,
    }).ok,
    true,
  );
  assert.equal(f.getState().products[0].averageHpp, 96000);
  assert.equal(
    f.commands.updateInvoice(invoice.id, {
      ...editable(invoice),
      customerName: "Nama baru",
    }).ok,
    true,
  );
  assert.equal(f.getState().invoices.at(-1)!.items[0].hppTotal, 144000);
  assert.equal(f.getState().products[0].averageHpp, 96000);
  assert.equal(
    f.commands.updateInvoice(invoice.id, {
      ...editable(f.getState().invoices.at(-1)!),
      items: [{ ...line, quantity: 3 }],
    }).ok,
    true,
  );
  const updated = f.getState().invoices.at(-1)!;
  assert.equal(updated.items[0].hppTotal, 240000);
  assert.equal(f.getState().products[0].stockBalance, 11);
  assert.equal(f.getState().products[0].averageHpp, 96000);
});

test("reducing sold quantity and deleting restores historical inventory value", () => {
  const f = fixture();
  const invoice = f.create();
  f.commands.receiveStock({
    supplierId: "supplier-1",
    date: input.date,
    productId: "product-1",
    manualWeight: 6,
    digitalWeight: 6,
    unitPurchasePrice: 120000,
    paidAmount: 0,
  });
  assert.equal(
    f.commands.updateInvoice(invoice.id, {
      ...editable(invoice),
      items: [{ ...line, quantity: 1 }],
    }).ok,
    true,
  );
  assert.equal(f.getState().products[0].stockBalance, 13);
  approximately(f.getState().products[0].averageHpp, (12 * 96000 + 72000) / 13);
  assert.equal(f.commands.deleteInvoice(invoice.id).ok, true);
  assert.equal(f.getState().products[0].stockBalance, 14);
  approximately(
    f.getState().products[0].averageHpp,
    (8 * 72000 + 6 * 120000) / 14,
  );
});

test("replacing products restores removed lines and deducts added products", () => {
  const f = fixture();
  const invoice = f.create();
  const value = {
    ...editable(invoice),
    items: [
      {
        ...line,
        productId: "product-2",
        quantity: 3,
        marginQuantity: 0,
        sellingPrice: 32000,
      },
    ],
  };
  assert.equal(f.commands.updateInvoice(invoice.id, value).ok, true);
  assert.equal(f.getState().products[0].stockBalance, 8);
  assert.equal(f.getState().products[1].stockBalance, 1);
  assert.equal(f.commands.deleteInvoice(invoice.id).ok, true);
  assert.equal(f.getState().products[1].stockBalance, 4);
});

test("edits use own reserved stock but cannot oversell or undercut recorded payments", () => {
  const f = fixture();
  const invoice = f.create();
  assert.equal(
    f.commands.updateInvoice(invoice.id, {
      ...editable(invoice),
      items: [{ ...line, quantity: 8 }],
    }).ok,
    true,
  );
  let current = f.getState().invoices.at(-1)!;
  const before = f.getState();
  assert.equal(
    f.commands.updateInvoice(invoice.id, {
      ...editable(current),
      items: [{ ...line, quantity: 9 }],
    }).ok,
    false,
  );
  assert.equal(f.getState(), before);
  f.commands.addPayment({
    ...paymentInput,
    invoiceId: invoice.id,
    amount: 100000,
  });
  current = f.getState().invoices.at(-1)!;
  assert.equal(
    f.commands.updateInvoice(invoice.id, {
      ...editable(current),
      items: [{ ...line, quantity: 0.5 }],
    }).ok,
    false,
  );
  assert.equal(f.getState().products[0].stockBalance, 0);
});

test("invoice dates cannot move after recorded payment dates", () => {
  const f = fixture();
  const invoice = f.create();
  f.commands.addPayment({ ...paymentInput, invoiceId: invoice.id });
  const current = f.getState().invoices.at(-1)!;
  assert.equal(
    f.commands.updateInvoice(invoice.id, {
      ...editable(current),
      date: "2026-11-12",
      dueDate: "2026-11-12",
    }).ok,
    false,
  );
});

test("payment add/edit/delete recomputes statuses without changing inventory", () => {
  const f = fixture();
  const invoice = f.create();
  const products = f.getState().products;
  const first = f.commands.addPayment({
    ...paymentInput,
    invoiceId: invoice.id,
  });
  assert.equal(first.ok, true);
  const payment = f.getState().payments.at(-1)!;
  assert.equal(
    f.commands.updatePayment(payment.id, {
      ...paymentInput,
      invoiceId: invoice.id,
      amount: invoice.total,
      expectedRevision: payment.revision,
    }).ok,
    true,
  );
  assert.equal(f.getState().invoices.at(-1)!.status, "PAID");
  assert.equal(
    f.commands.updatePayment(payment.id, {
      ...paymentInput,
      invoiceId: invoice.id,
      amount: 100000,
    }).ok,
    true,
  );
  assert.equal(f.getState().invoices.at(-1)!.outstandingAmount, 105000);
  assert.equal(f.commands.deletePayment(payment.id).ok, true);
  assert.equal(f.getState().invoices.at(-1)!.paidAmount, 0);
  assert.equal(f.getState().invoices.at(-1)!.status, "ISSUED");
  assert.equal(f.getState().products, products);
});

test("payments reject overpay, fractional Rupiah, wrong dates, method and invoice moves", () => {
  const f = fixture();
  const invoice = f.create();
  const before = f.getState();
  for (const override of [
    { amount: invoice.total + 1 },
    { amount: 0 },
    { amount: -1 },
    { amount: 0.5 },
    { amount: NaN },
    { date: "2026-11-10" },
    { date: "invalid" },
    { method: "" },
    { invoiceId: "missing" },
  ]) {
    assert.equal(
      f.commands.addPayment({
        ...paymentInput,
        invoiceId: invoice.id,
        ...override,
      }).ok,
      false,
    );
  }
  assert.equal(f.getState(), before);
  const payment = f.commands.addPayment({
    ...paymentInput,
    invoiceId: invoice.id,
  });
  assert.equal(
    f.commands.updatePayment(payment.id!, {
      ...paymentInput,
      invoiceId: "invoice-127",
    }).ok,
    false,
  );
});

test("stale invoice and payment revisions never overwrite newer corrections", () => {
  const f = fixture();
  const invoice = f.create();
  const stale = editable(invoice);
  const payment = f.commands.addPayment({
    ...paymentInput,
    invoiceId: invoice.id,
  });
  assert.equal(f.commands.updateInvoice(invoice.id, stale).ok, false);
  assert.equal(
    f.commands.deleteInvoice(invoice.id, {
      expectedRevision: invoice.revision,
      deletePayments: true,
    }).ok,
    false,
  );
  const old = f.getState().payments.at(-1)!;
  f.commands.updatePayment(payment.id!, {
    ...paymentInput,
    invoiceId: invoice.id,
    amount: 60000,
    expectedRevision: old.revision,
  });
  assert.equal(
    f.commands.updatePayment(payment.id!, {
      ...paymentInput,
      invoiceId: invoice.id,
      expectedRevision: old.revision,
    }).ok,
    false,
  );
  assert.equal(f.commands.deletePayment(payment.id!, old.revision).ok, false);
  assert.equal(f.getState().invoices.at(-1)!.paidAmount, 60000);
});

test("paid invoice deletion needs explicit approval, restores stock, and retains numbering", () => {
  const f = fixture();
  const invoice = f.create();
  f.commands.addPayment({ ...paymentInput, invoiceId: invoice.id });
  const before = f.getState();
  assert.equal(f.commands.deleteInvoice(invoice.id).ok, false);
  assert.equal(f.getState(), before);
  assert.equal(
    f.commands.deleteInvoice(invoice.id, { deletePayments: true }).ok,
    true,
  );
  assert.equal(f.getState().payments.length, 0);
  assert.equal(f.getState().products[0].stockBalance, 8);
  assert.equal(f.create().invoiceNumber, "INV/2026/11/0002");
});

test("legacy invoice metadata correction and explicit deletion do not invent stock", () => {
  const f = fixture();
  const invoice = f.getState().invoices[0];
  const beforeProducts = f.getState().products;
  assert.equal(
    f.commands.updateInvoice(invoice.id, {
      ...editable(invoice),
      customerName: "Koreksi nama",
    }).ok,
    true,
  );
  const current = f.getState().invoices[0];
  assert.equal(current.total, invoice.total);
  assert.equal(current.paidAmount, invoice.paidAmount);
  assert.deepEqual(f.getState().products, beforeProducts);
  assert.equal(
    f.commands.updateInvoice(invoice.id, { ...editable(current), discount: 1 })
      .ok,
    false,
  );
  assert.equal(
    f.commands.updateInvoice(invoice.id, {
      ...editable(current),
      items: [line],
    }).ok,
    false,
  );
  assert.equal(
    f.commands.deleteInvoice(invoice.id, { deletePayments: true }).ok,
    false,
  );
  assert.equal(
    f.commands.deleteInvoice(invoice.id, {
      deletePayments: true,
      acknowledgeMissingItems: true,
    }).ok,
    true,
  );
  assert.deepEqual(f.getState().products, beforeProducts);
});

test("payment corrections preserve legacy paid balances with no transaction records", () => {
  const f = fixture();
  const invoice = f
    .getState()
    .invoices.find((item) => item.id === "invoice-127")!;
  f.store.update((state) => ({
    ...state,
    invoices: state.invoices.map((item) =>
      item.id === invoice.id
        ? {
            ...item,
            paidAmount: 100000,
            outstandingAmount: item.total - 100000,
            status: "PARTIALLY_PAID",
          }
        : item,
    ),
  }));
  const payment = f.commands.addPayment({
    ...paymentInput,
    invoiceId: invoice.id,
  });
  assert.equal(
    f.getState().invoices.find((item) => item.id === invoice.id)!.paidAmount,
    150000,
  );
  f.commands.updatePayment(payment.id!, {
    ...paymentInput,
    invoiceId: invoice.id,
    amount: 75000,
  });
  assert.equal(
    f.getState().invoices.find((item) => item.id === invoice.id)!.paidAmount,
    175000,
  );
  f.commands.deletePayment(payment.id!);
  assert.equal(
    f.getState().invoices.find((item) => item.id === invoice.id)!.paidAmount,
    100000,
  );
});

test("all invoice and payment correction commands roll back when persistence fails", () => {
  const f = fixture();
  const invoice = f.create();
  const payment = f.commands.addPayment({
    ...paymentInput,
    invoiceId: invoice.id,
  });
  const before = f.getState();
  const raw = f.raw();
  const current = f.getState().invoices.at(-1)!;
  f.fail(true);
  for (const save of [
    () =>
      f.commands.updateInvoice(invoice.id, {
        ...editable(current),
        items: [{ ...line, quantity: 3 }],
      }),
    () => f.commands.deleteInvoice(invoice.id, { deletePayments: true }),
    () =>
      f.commands.updatePayment(payment.id!, {
        ...paymentInput,
        invoiceId: invoice.id,
        amount: 60000,
      }),
    () => f.commands.deletePayment(payment.id!),
  ]) {
    const result = save();
    assert.equal(result.ok, false);
    assert.match(result.message, /belum disimpan/);
    assert.equal(f.getState(), before);
    assert.equal(f.raw(), raw);
  }
  f.fail(false);
  assert.equal(
    f.commands.updateInvoice(invoice.id, {
      ...editable(current),
      customerName: "Berhasil dicoba ulang",
    }).ok,
    true,
  );
});

test("missing original products block inventory correction and deletion", () => {
  const f = fixture();
  const invoice = f.create();
  f.store.update((state) => ({
    ...state,
    products: state.products.filter((item) => item.id !== "product-1"),
  }));
  assert.equal(
    f.commands.updateInvoice(invoice.id, {
      ...editable(invoice),
      items: [{ ...line, productId: "product-2" }],
    }).ok,
    false,
  );
  assert.equal(f.commands.deleteInvoice(invoice.id).ok, false);
});

test("product snapshots and revisions survive reload and reject malformed values", () => {
  const f = fixture();
  const invoice = f.create();
  const saved = normalizeBusinessState(JSON.parse(f.raw()));
  assert.equal(
    saved.invoices.at(-1)!.items[0].productName,
    "Udang Vaname 31/40",
  );
  assert.equal(saved.invoices.at(-1)!.revision, 1);
  const renamed = structuredClone(saved);
  renamed.products[0].name = "Nama produk baru";
  assert.equal(
    calculateInvoice(renamed, editable(invoice), invoice).items[0].productName,
    "Udang Vaname 31/40",
  );
  const corrupt = JSON.parse(f.raw());
  corrupt.invoices.at(-1).revision = -1;
  assert.throws(() => normalizeBusinessState(corrupt));
});

test("invoice, payment shortcuts and direct details render the specialized workspace", () => {
  const f = fixture();
  const invoice = f.create();
  const render = (props: Partial<Parameters<typeof WorkspacePage>[0]>) =>
    renderToStaticMarkup(
      createElement(WorkspacePage, {
        module: "resto",
        page: "Invoices",
        business: f.getState(),
        commands: f.commands,
        onNotify: () => {},
        ...props,
      }),
    );
  const form = render({ initialFormOpen: true });
  assert.match(form, /Invoice baru/);
  assert.match(form, /Informasi Pelanggan/);
  assert.match(form, /Item Produk/);
  assert.match(form, /Tambah Item/);
  assert.match(form, /HPP Rata-rata Stok/);
  assert.match(form, /Ringkasan Internal/);
  assert.match(form, /Laba Transaksi/);
  assert.match(form, /Margin timbangan/);
  assert.doesNotMatch(form, /form-modal/);
  const detail = render({ initialInvoiceId: invoice.id });
  assert.match(detail, /invoice-print-sheet/);
  assert.match(detail, /Udang Vaname/);
  assert.match(detail, /Riwayat pembayaran/);
  assert.match(detail, /Status Pembayaran/);
  assert.match(detail, /Ringkasan Internal/);
  assert.match(detail, /Laba Transaksi/);
  assert.match(detail, /Qty Stok/);
  assert.match(detail, /Harga Jual/);
  assert.match(detail, /Total tonjolan bobot/);
  assert.match(detail, /Progres pembayaran/);
  assert.match(detail, /Unduh PDF/);
  assert.match(detail, /Kirim WhatsApp/);
  assert.doesNotMatch(detail, /Cetak/);
  const list = render({});
  assert.match(list, /Total tagihan aktif/);
  assert.match(list, /Belum Lunas/);
  assert.match(list, /Jatuh Tempo/);
  assert.match(list, /Nomor Invoice/);
  assert.match(list, /Margin/);
  const payment = render({ page: "Payments", initialFormOpen: true });
  assert.match(payment, /Jumlah pembayaran/);
  assert.match(payment, /Invoice belum lunas/);
  const payments = render({ page: "Payments" });
  assert.match(payments, /Total Piutang/);
  assert.match(payments, /Pembayaran Masuk/);
  assert.match(payments, /Invoice Overdue/);
});
