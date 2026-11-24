import type { Module } from "@/src/domain/dashboard";

export type DashboardLocation = {
  module: Module;
  page: string | null;
  invoiceId?: string;
  batchId?: string;
};

const lapakPages: Record<string, string> = {
  Batch: "Batches",
  Tagihan: "B2C Sales",
  // Legacy visible label kept resolvable for saved shortcuts and older links.
  Penjualan: "B2C Sales",
  Pengeluaran: "Expenses",
  Pengadaan: "Sourcing & Bengkelan",
  Komisi: "Commission",
  // Legacy visible label kept resolvable for saved shortcuts and older links.
  Bengkelan: "Sourcing & Bengkelan",
  Laporan: "Laporan Lapak",
};

const restoPages: Record<string, string> = {
  Stok: "Stock, Price & Cost",
  Invoice: "Invoices",
  Pembayaran: "Payments",
  Utang: "Payables",
  Pengeluaran: "Operating Expenses",
  Restoran: "Restaurants",
  Supplier: "Suppliers",
  Laporan: "Laporan Resto",
  Pengaturan: "Pengaturan Resto",
};

export function resolveWorkspacePage(module: Module, page: string): string {
  if (module === "lapak") return lapakPages[page] ?? page;
  if (module === "resto")
    return (
      restoPages[page] ?? (page === "Expenses" ? "Operating Expenses" : page)
    );
  return page;
}

const visiblePages: Record<
  Exclude<Module, "overview">,
  Record<string, string>
> = {
  lapak: {
    dashboard: "Dashboard",
    batch: "Batch",
    tagihan: "Tagihan",
    komisi: "Komisi",
    pengadaan: "Pengadaan",
    pengeluaran: "Pengeluaran",
    laporan: "Laporan",
  },
  resto: {
    dashboard: "Dashboard",
    stok: "Stok",
    invoice: "Invoice",
    pembayaran: "Pembayaran",
    utang: "Utang",
    pengeluaran: "Pengeluaran",
    restoran: "Restoran",
    supplier: "Supplier",
    laporan: "Laporan",
    pengaturan: "Pengaturan",
  },
};

const legacyPageLabels: Record<
  Exclude<Module, "overview">,
  Record<string, string>
> = {
  lapak: {
    batches: "Batch",
    "b2c-sales": "Tagihan",
    expenses: "Pengeluaran",
    commission: "Komisi",
    "sourcing-dan-bengkelan": "Pengadaan",
    "laporan-lapak": "Laporan",
  },
  resto: {
    "stock-price-dan-cost": "Stok",
    invoices: "Invoice",
    payments: "Pembayaran",
    payables: "Utang",
    "operating-expenses": "Pengeluaran",
    restaurants: "Restoran",
    suppliers: "Supplier",
    reports: "Laporan",
    "laporan-resto": "Laporan",
    "pengaturan-resto": "Pengaturan",
  },
};

const slugForPage = (page: string) =>
  page
    .trim()
    .toLowerCase()
    .replaceAll("&", "dan")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function pageFromSlug(module: Exclude<Module, "overview">, slug: string) {
  return visiblePages[module][slug] ?? legacyPageLabels[module][slug] ?? null;
}

function canonicalPage(module: Exclude<Module, "overview">, page: string) {
  const visible = visiblePages[module][slugForPage(page)];
  if (visible) return visible;
  return (
    Object.entries(lapakPagesFor(module)).find(
      ([, implementation]) => implementation === page,
    )?.[0] ??
    Object.entries(legacyPageLabels[module]).find(
      ([, label]) => label === page,
    )?.[1] ??
    page
  );
}

function lapakPagesFor(module: Exclude<Module, "overview">) {
  return module === "lapak" ? lapakPages : restoPages;
}

/** Stable App Router URL for dashboard navigation. */
export function dashboardPathForTarget(
  module: Module,
  page?: string,
  invoiceId?: string,
  batchId?: string,
) {
  if (module === "overview" && !page) return "/dashboard";
  if (module === "overview")
    return `/dashboard/overview/${slugForPage(page ?? "")}`;

  const visiblePage = page ? canonicalPage(module, page) : "Dashboard";
  const section =
    visiblePage === "Dashboard" ? "" : `/${slugForPage(visiblePage)}`;
  const identifier =
    visiblePage === "Invoice"
      ? invoiceId
      : visiblePage === "Batch"
        ? batchId
        : undefined;
  return `/dashboard/${module}${section}${identifier ? `/${encodeURIComponent(identifier)}` : ""}`;
}

/** Parses both the canonical dashboard URL and the root route fallback. */
export function dashboardLocationFromPath(pathname: string): DashboardLocation {
  const segments = pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (segments[0] !== "dashboard") {
    return { module: "overview", page: null };
  }

  const moduleSegment = segments[1];
  if (moduleSegment === "overview") {
    return {
      module: "overview",
      page: segments[2]
        ? segments[2][0].toUpperCase() + segments[2].slice(1)
        : null,
    };
  }
  if (moduleSegment !== "lapak" && moduleSegment !== "resto") {
    return { module: "overview", page: null };
  }

  const slug = segments[2];
  if (!slug) return { module: moduleSegment, page: "Dashboard" };

  const page = pageFromSlug(moduleSegment, slug);
  if (!page) return { module: moduleSegment, page: "Dashboard" };

  const identifier = segments[3];
  return {
    module: moduleSegment,
    page,
    ...(moduleSegment === "lapak" && page === "Batch" && identifier
      ? { batchId: identifier }
      : {}),
    ...(moduleSegment === "resto" && page === "Invoice" && identifier
      ? { invoiceId: identifier }
      : {}),
  };
}
