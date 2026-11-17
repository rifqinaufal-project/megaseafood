import type { Module } from "@/src/domain/dashboard";

const lapakPages: Record<string, string> = {
  Batch: "Batches",
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
  if (module === "resto") return restoPages[page] ?? (page === "Expenses" ? "Operating Expenses" : page);
  return page;
}
