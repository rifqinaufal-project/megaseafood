import assert from "node:assert/strict";
import { test } from "node:test";
import {
  invoiceRevenueTotal,
  restaurantReceivableTotal,
  unpaidInvoiceReceivable,
  unpaidInvoices,
} from "../src/domain/resto-summary";
import type { Invoice } from "../src/domain/business-state";

const invoice = (overrides: Partial<Invoice>) =>
  ({ id: "i", total: 0, outstandingAmount: 0, restaurantId: "", ...overrides }) as Invoice;

test("invoiceRevenueTotal sums invoice totals, including ONLINE", () => {
  assert.equal(
    invoiceRevenueTotal([
      invoice({ total: 1000, restaurantId: "r1" }),
      invoice({ total: 500, restaurantId: "" }),
    ]),
    1500,
  );
  assert.equal(invoiceRevenueTotal([]), 0);
});

test("unpaidInvoiceReceivable counts ONLINE invoices, unlike restaurantReceivableTotal", () => {
  const invoices = [
    invoice({ outstandingAmount: 300, restaurantId: "r1" }),
    invoice({ outstandingAmount: 200, restaurantId: "" }),
    invoice({ outstandingAmount: 0, restaurantId: "r1" }),
  ];
  assert.equal(unpaidInvoiceReceivable(invoices), 500);
  assert.equal(restaurantReceivableTotal(invoices), 300);
});

test("unpaidInvoices keeps only invoices with an outstanding balance", () => {
  const invoices = [
    invoice({ id: "a", outstandingAmount: 1 }),
    invoice({ id: "b", outstandingAmount: 0 }),
    invoice({ id: "c", outstandingAmount: -5 }),
  ];
  assert.deepEqual(unpaidInvoices(invoices).map((item) => item.id), ["a"]);
});
