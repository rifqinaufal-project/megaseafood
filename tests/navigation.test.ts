import assert from "node:assert/strict";
import { test } from "node:test";
import type { Module } from "../src/domain/dashboard";
import {
  dashboardLocationFromPath,
  dashboardPathForTarget,
  resolveDashboardRoute,
  resolveWorkspacePage,
} from "../src/presentation/dashboard/workspace-routing";
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
  const visiblePages: Record<
    Exclude<Module, "overview">,
    Record<string, string>
  > = {
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
  assert.equal(
    resolveWorkspacePage("lapak", "Pengadaan"),
    "Sourcing & Bengkelan",
  );
  // Halaman Buku Tagihan sempat tampil sebagai "Penjualan"; shortcut lama tetap jalan.
  assert.equal(resolveWorkspacePage("lapak", "Penjualan"), "B2C Sales");
  assert.equal(
    resolveWorkspacePage("lapak", "Bengkelan"),
    "Sourcing & Bengkelan",
  );
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

test("dashboard routes round-trip visible workspace navigation", () => {
  const cases = [
    ["/dashboard", { module: "overview", page: null }],
    ["/dashboard/lapak", { module: "lapak", page: "Dashboard" }],
    ["/dashboard/lapak/batch", { module: "lapak", page: "Batch" }],
    [
      "/dashboard/lapak/batch/batch-42",
      { module: "lapak", page: "Batch", batchId: "batch-42" },
    ],
    [
      "/dashboard/resto/invoice/inv-1",
      { module: "resto", page: "Invoice", invoiceId: "inv-1" },
    ],
  ] as const;

  for (const [path, expected] of cases) {
    assert.deepEqual(dashboardLocationFromPath(path), expected);
  }
  assert.equal(
    dashboardPathForTarget("lapak", "Batch"),
    "/dashboard/lapak/batch",
  );
  assert.equal(
    dashboardPathForTarget("lapak", "Batch", undefined, "batch-42"),
    "/dashboard/lapak/batch/batch-42",
  );
  assert.equal(
    dashboardPathForTarget("resto", "Invoice", "inv-1"),
    "/dashboard/resto/invoice/inv-1",
  );
  assert.equal(
    dashboardPathForTarget("lapak", "Komisi", undefined, "batch-42"),
    "/dashboard/lapak/komisi",
  );
  assert.equal(
    dashboardPathForTarget("resto", "Invoices"),
    "/dashboard/resto/invoice",
  );
  assert.deepEqual(dashboardLocationFromPath("/dashboard/resto/invoices"), {
    module: "resto",
    page: "Invoice",
  });
});

test("legacy dashboard slugs resolve to canonical redirects", () => {
  const legacyRoutes = [
    ["lapak/batches", "/dashboard/lapak/batch"],
    ["lapak/b2c-sales", "/dashboard/lapak/tagihan"],
    ["resto/invoices/inv-1", "/dashboard/resto/invoice/inv-1"],
    ["resto/operating-expenses", "/dashboard/resto/pengeluaran"],
    ["overview", "/dashboard"],
  ] as const;

  for (const [segments, canonicalPath] of legacyRoutes) {
    const route = resolveDashboardRoute(segments.split("/"));
    assert.ok(route);
    assert.equal(route.isCanonical, false);
    assert.equal(route.canonicalPath, canonicalPath);
  }
});

test("unknown dashboard slugs and extra segments are invalid", () => {
  for (const pathname of [
    "/dashboard/unknown",
    "/dashboard/lapak/not-a-page",
    "/dashboard/resto/invoice/inv-1/extra",
    "/dashboard/lapak/komisi/batch-42",
    "/dashboard/overview/aktivitas/extra",
  ]) {
    assert.equal(dashboardLocationFromPath(pathname), null, pathname);
  }

  assert.equal(resolveDashboardRoute(["lapak", "batch", ""]), null);
});

test("detail identifiers are accepted only by their detail routes", () => {
  assert.deepEqual(
    dashboardLocationFromPath("/dashboard/lapak/batch/batch%2F42"),
    { module: "lapak", page: "Batch", batchId: "batch/42" },
  );
  assert.deepEqual(
    dashboardLocationFromPath("/dashboard/resto/invoice/inv-1"),
    { module: "resto", page: "Invoice", invoiceId: "inv-1" },
  );
  assert.equal(
    dashboardLocationFromPath("/dashboard/lapak/komisi/batch-42"),
    null,
  );
  assert.equal(
    dashboardLocationFromPath("/dashboard/resto/pembayaran/inv-1"),
    null,
  );
  assert.equal(
    dashboardPathForTarget("lapak", "Batch", undefined, "batch/42"),
    "/dashboard/lapak/batch/batch%2F42",
  );
});
