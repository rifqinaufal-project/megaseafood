import assert from "node:assert/strict";
import { test } from "node:test";
import { searchResultHref } from "../src/shell/search-href";

const base = { kind: "Data", title: "Judul", detail: "Rincian" };

test("search results open the page that owns them", () => {
  assert.equal(searchResultHref({ ...base, module: "resto", page: "Invoice", invoiceId: "i-1" }), "/resto/invoice/i-1");
  assert.equal(searchResultHref({ ...base, module: "lapak", page: "Komisi", batchId: "b-1" }), "/lapak/batch/b-1?tab=komisi");
  assert.equal(searchResultHref({ ...base, module: "lapak", page: "Pengeluaran", batchId: "b-1" }), "/lapak/batch/b-1?tab=pengeluaran");
  assert.equal(searchResultHref({ ...base, module: "resto", page: "Pengeluaran" }), "/resto/keuangan?tab=pengeluaran");
  assert.equal(searchResultHref({ ...base, module: "resto", page: "Utang" }), "/resto/keuangan?tab=utang");
});

test("search results without a page of their own return no link", () => {
  assert.equal(searchResultHref({ ...base, module: "overview", page: "Aktivitas" }), null);
});
