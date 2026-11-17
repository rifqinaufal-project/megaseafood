import assert from "node:assert/strict";
import { test } from "node:test";
import { seedBusinessState } from "../src/domain/business-state";
import { buildInvoicePdf, invoiceFileName } from "../src/presentation/dashboard/invoice-pdf";
import { invoiceWhatsappLink, whatsappNumber } from "../src/presentation/dashboard/invoice-share";

test("whatsappNumber normalizes Indonesian numbers", () => {
  assert.equal(whatsappNumber("0812-3344 5566"), "6281233445566");
  assert.equal(whatsappNumber("+62 812 3344 5566"), "6281233445566");
  assert.equal(whatsappNumber("81233445566"), "6281233445566");
  assert.equal(whatsappNumber("123"), null);
  assert.equal(whatsappNumber(""), null);
});

test("invoice WhatsApp link uses the restaurant phone and reports problems", () => {
  const state = seedBusinessState();
  const restaurant = state.restaurants[0];
  const invoice = { ...state.invoices[1], restaurantId: restaurant.id, customerName: restaurant.name };
  const link = invoiceWhatsappLink(invoice, state);
  assert.equal(link.ok, true);
  if (link.ok) {
    assert.ok(link.url.startsWith("https://wa.me/6281233445566?text="));
    assert.match(decodeURIComponent(link.url), new RegExp(invoice.invoiceNumber));
  }
  const noPhone = { ...state, restaurants: state.restaurants.map((item) => ({ ...item, phone: "" })) };
  const missing = invoiceWhatsappLink(invoice, noPhone);
  assert.equal(missing.ok, false);
  assert.equal(invoiceWhatsappLink({ ...invoice, restaurantId: "tidak-ada" }, state).ok, false);
});

test("invoice PDF is generated without internal figures", async () => {
  const state = seedBusinessState();
  const invoice = state.invoices[0];
  const doc = await buildInvoicePdf(invoice, state);
  assert.ok(doc.getNumberOfPages() >= 1);
  assert.ok(doc.output("arraybuffer").byteLength > 1000);
  assert.match(invoiceFileName(invoice), /^INV-2026-06-0128\.pdf$/);
});
