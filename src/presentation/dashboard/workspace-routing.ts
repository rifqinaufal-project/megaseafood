import type { Module } from "@/src/domain/dashboard";

type WorkspaceModule = Exclude<Module, "overview">;

export type DashboardLocation = {
  module: Module;
  page: string | null;
  invoiceId?: string;
  batchId?: string;
};

export type DashboardRoute = {
  location: DashboardLocation;
  canonicalPath: string;
  isCanonical: boolean;
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

/** The only page slugs that are rendered as canonical dashboard routes. */
const visiblePages: Record<WorkspaceModule, Record<string, string>> = {
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

/** Slugs accepted for compatibility and redirected to a canonical route. */
const legacyPageAliases: Record<WorkspaceModule, Record<string, string>> = {
  lapak: {
    batches: "batch",
    "b2c-sales": "tagihan",
    penjualan: "tagihan",
    expenses: "pengeluaran",
    commission: "komisi",
    bengkelan: "pengadaan",
    "sourcing-dan-bengkelan": "pengadaan",
    "laporan-lapak": "laporan",
  },
  resto: {
    "stock-price-dan-cost": "stok",
    invoices: "invoice",
    payments: "pembayaran",
    payables: "utang",
    expenses: "pengeluaran",
    "operating-expenses": "pengeluaran",
    restaurants: "restoran",
    suppliers: "supplier",
    reports: "laporan",
    "laporan-resto": "laporan",
    "pengaturan-resto": "pengaturan",
    settings: "pengaturan",
  },
};

const overviewPages: Record<string, string> = {
  aktivitas: "Aktivitas",
  laporan: "Laporan",
};

const slugForPage = (page: string) =>
  page
    .trim()
    .toLowerCase()
    .replaceAll("&", "dan")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function pageFromSlug(
  module: WorkspaceModule,
  slug: string,
): { page: string; isCanonical: boolean } | null {
  const canonicalPage = visiblePages[module][slug];
  if (canonicalPage) return { page: canonicalPage, isCanonical: true };

  const canonicalSlug = legacyPageAliases[module][slug];
  if (!canonicalSlug) return null;
  const page = visiblePages[module][canonicalSlug];
  return page ? { page, isCanonical: false } : null;
}

function canonicalPageForTarget(module: WorkspaceModule, page: string) {
  const visiblePage = Object.values(visiblePages[module]).find(
    (label) => label === page,
  );
  if (visiblePage) return visiblePage;

  const implementationPages = module === "lapak" ? lapakPages : restoPages;
  const implementationPage = Object.entries(implementationPages).find(
    ([, implementation]) => implementation === page,
  )?.[0];
  if (implementationPage) return implementationPage;

  // These implementation names are useful to callers but are not route names.
  const targetAliases: Record<string, string> =
    module === "lapak"
      ? {
          "B2C Sales": "Tagihan",
          Commission: "Komisi",
          Expenses: "Pengeluaran",
          Penjualan: "Tagihan",
          Bengkelan: "Pengadaan",
          "Laporan Lapak": "Laporan",
          "Sourcing & Bengkelan": "Pengadaan",
        }
      : {
          "Stock, Price & Cost": "Stok",
          Invoices: "Invoice",
          Payments: "Pembayaran",
          Payables: "Utang",
          Expenses: "Pengeluaran",
          "Operating Expenses": "Pengeluaran",
          Restaurants: "Restoran",
          Suppliers: "Supplier",
          Reports: "Laporan",
          "Laporan Resto": "Laporan",
          "Pengaturan Resto": "Pengaturan",
        };
  return targetAliases[page] ?? page;
}

function routeForLocation(
  location: DashboardLocation,
  isCanonical: boolean,
): DashboardRoute {
  return {
    location,
    canonicalPath: dashboardPathForTarget(
      location.module,
      location.page ?? undefined,
      location.invoiceId,
      location.batchId,
    ),
    isCanonical,
  };
}

/** Stable App Router URL for dashboard navigation. */
export function dashboardPathForTarget(
  module: Module,
  page?: string,
  invoiceId?: string,
  batchId?: string,
) {
  if (module === "overview" && !page) return "/dashboard";
  if (module === "overview") {
    return `/dashboard/overview/${slugForPage(page ?? "")}`;
  }

  const visiblePage = page
    ? canonicalPageForTarget(module, page)
    : "Dashboard";
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

/**
 * Resolves the optional catch-all segment after `/dashboard`.
 *
 * This is deliberately strict: a route can either be a known page or a
 * detail route for Batch/Invoice. The App Router uses `null` to render 404
 * instead of silently falling back to the overview page.
 */
export function resolveDashboardRoute(
  segments: readonly string[] | undefined,
): DashboardRoute | null {
  const parts = segments ? [...segments] : [];
  if (parts.length === 0) {
    return routeForLocation({ module: "overview", page: null }, true);
  }

  if (parts[0] === "overview") {
    if (parts.length === 1) {
      return routeForLocation({ module: "overview", page: null }, false);
    }
    if (parts.length !== 2) return null;
    const page = overviewPages[parts[1]];
    return page
      ? routeForLocation({ module: "overview", page }, true)
      : null;
  }

  if (parts[0] !== "lapak" && parts[0] !== "resto") return null;
  const routeModule = parts[0];

  if (parts.length === 1) {
    return routeForLocation({ module: routeModule, page: "Dashboard" }, true);
  }

  const resolvedPage = pageFromSlug(routeModule, parts[1]);
  if (!resolvedPage) return null;

  if (resolvedPage.page === "Dashboard") {
    return parts.length === 2
      ? routeForLocation({ module: routeModule, page: "Dashboard" }, false)
      : null;
  }

  if (parts.length === 3) {
    const isBatchDetail =
      routeModule === "lapak" && resolvedPage.page === "Batch";
    const isInvoiceDetail =
      routeModule === "resto" && resolvedPage.page === "Invoice";
    if (!isBatchDetail && !isInvoiceDetail) return null;
    if (!parts[2]) return null;
    return routeForLocation(
      {
        module: routeModule,
        page: resolvedPage.page,
        ...(routeModule === "lapak" && resolvedPage.page === "Batch"
          ? { batchId: parts[2] }
          : {}),
        ...(routeModule === "resto" && resolvedPage.page === "Invoice"
          ? { invoiceId: parts[2] }
          : {}),
      },
      resolvedPage.isCanonical,
    );
  }

  if (parts.length !== 2) return null;
  return routeForLocation(
    { module: routeModule, page: resolvedPage.page },
    resolvedPage.isCanonical,
  );
}

/** Parses a dashboard pathname strictly; invalid paths return `null`. */
export function dashboardLocationFromPath(
  pathname: string,
): DashboardLocation | null {
  let segments: string[];
  try {
    segments = pathname
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }

  if (segments[0] !== "dashboard") return null;
  return resolveDashboardRoute(segments.slice(1))?.location ?? null;
}
