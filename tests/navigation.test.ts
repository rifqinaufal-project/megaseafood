import assert from "node:assert/strict";
import { test } from "node:test";
import type { Module } from "../src/domain/dashboard";
import { resolveWorkspacePage } from "../src/presentation/dashboard/workspace-routing";
import {
  moduleLabels,
  workspaceNavLabels,
} from "../src/presentation/dashboard/workspace-navigation";

test("workspace navigation has one clear menu per module", () => {
  assert.deepEqual(moduleLabels, {
    overview: "Overview",
    lapak: "Lapak",
    resto: "Resto & Online",
  });
  assert.deepEqual(workspaceNavLabels.overview, ["Aktivitas", "Laporan"]);
  assert.deepEqual(workspaceNavLabels.lapak, [
    "Dashboard",
    "Batch",
    "Tagihan",
    "Komisi",
    "Pengadaan",
    "Pengeluaran",
  ]);
  assert.deepEqual(workspaceNavLabels.resto, [
    "Dashboard",
    "Stok",
    "Invoice",
    "Pembayaran",
    "Utang",
    "Pengeluaran",
    "Restoran",
    "Supplier",
    "Laporan",
  ]);

  for (const labels of Object.values(workspaceNavLabels)) {
    assert.equal(new Set(labels).size, labels.length);
  }
});

test("visible workspace labels resolve to their existing page implementations", () => {
  const visiblePages: Record<Exclude<Module, "overview">, Record<string, string>> = {
    lapak: {
      Batch: "Batches",
      Tagihan: "B2C Sales",
      Komisi: "Commission",
      Pengadaan: "Sourcing & Bengkelan",
      Pengeluaran: "Expenses",
    },
    resto: {
      Stok: "Stock, Price & Cost",
      Invoice: "Invoices",
      Pembayaran: "Payments",
      Utang: "Payables",
      Pengeluaran: "Operating Expenses",
      Restoran: "Restaurants",
      Supplier: "Suppliers",
      Laporan: "Laporan Resto",
    },
  };

  for (const [module, pages] of Object.entries(visiblePages)) {
    for (const [label, implementation] of Object.entries(pages)) {
      assert.equal(
        resolveWorkspacePage(module as Exclude<Module, "overview">, label),
        implementation,
      );
    }
  }
  assert.equal(resolveWorkspacePage("resto", "Pengaturan"), "Pengaturan Resto");
});

test("legacy page aliases remain resolvable", () => {
  for (const page of [
    "Batches",
    "Expenses",
    "Commission",
    "B2C Sales",
    "Sourcing & Bengkelan",
    "Laporan Lapak",
  ]) {
    assert.equal(resolveWorkspacePage("lapak", page), page);
  }
  assert.equal(resolveWorkspacePage("lapak", "Pengadaan"), "Sourcing & Bengkelan");
  // Halaman Buku Tagihan sempat tampil sebagai "Penjualan"; shortcut lama tetap jalan.
  assert.equal(resolveWorkspacePage("lapak", "Penjualan"), "B2C Sales");
  assert.equal(resolveWorkspacePage("lapak", "Bengkelan"), "Sourcing & Bengkelan");
  assert.equal(resolveWorkspacePage("lapak", "Laporan"), "Laporan Lapak");
  for (const page of [
    "Stock, Price & Cost",
    "Invoices",
    "Payments",
    "Payables",
    "Operating Expenses",
    "Restaurants",
    "Suppliers",
    "Reports",
    "Laporan Resto",
  ]) {
    assert.equal(resolveWorkspacePage("resto", page), page);
  }
  assert.equal(resolveWorkspacePage("resto", "Expenses"), "Operating Expenses");
});
