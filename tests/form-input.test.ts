import assert from "node:assert/strict";
import { test } from "node:test";
import { asMoney, asNumber, validateFormItem } from "../src/domain/form-input";

test("asMoney reads Indonesian money format and treats blank input as zero", () => {
  assert.equal(asMoney("1.500.000,5"), 1500000.5);
  assert.equal(asMoney("250000"), 250000);
  assert.equal(asMoney(""), 0);
  assert.equal(asMoney("abc"), 0);
});

test("asNumber treats blank or invalid input as zero", () => {
  assert.equal(asNumber("12.5"), 12.5);
  assert.equal(asNumber(""), 0);
  assert.equal(asNumber("x"), 0);
});

test("Commission requires a batch, partner, and non-zero amount", () => {
  const valid = { partner: "Budi", amount: "-5000" };
  assert.equal(validateFormItem("Commission", valid, true), null);
  assert.equal(
    validateFormItem("Commission", valid, false),
    "Pilih batch Lapak yang tersedia",
  );
  assert.equal(
    validateFormItem("Commission", { partner: " ", amount: "5000" }, true),
    "Partner dan jumlah komisi wajib diisi; komisi boleh positif atau negatif",
  );
  assert.equal(
    validateFormItem("Commission", { partner: "Budi", amount: "" }, true),
    "Partner dan jumlah komisi wajib diisi; komisi boleh positif atau negatif",
  );
});

test("Expenses requires a name and a positive amount", () => {
  assert.equal(
    validateFormItem("Expenses", { expenseName: "Es batu", amount: "10000" }, true),
    null,
  );
  assert.equal(
    validateFormItem("Expenses", { expenseName: "Es batu", amount: "-1" }, true),
    "Nama dan jumlah pengeluaran wajib diisi",
  );
});

test("Sourcing requires name, type, weight, price and non-negative payments", () => {
  const valid = {
    name: "CV Test",
    type: "Udang",
    weight: "10",
    price: "50000",
    payment1: "0",
    payment2: "",
    payment3: "",
  };
  const message = "Nama, jenis, bobot, dan harga pengadaan wajib valid";
  assert.equal(validateFormItem("Sourcing & Bengkelan", valid, true), null);
  assert.equal(validateFormItem("Sourcing & Bengkelan", { ...valid, name: "" }, true), message);
  assert.equal(validateFormItem("Sourcing & Bengkelan", { ...valid, weight: "0" }, true), message);
  assert.equal(validateFormItem("Sourcing & Bengkelan", { ...valid, price: "" }, true), message);
  assert.equal(validateFormItem("Sourcing & Bengkelan", { ...valid, payment2: "-1" }, true), message);
});

test("pages without a batch rule ignore the batch flag", () => {
  assert.equal(validateFormItem("Sourcing & Bengkelan", { name: "A", type: "B", weight: "1", price: "1" }, false), null);
});
