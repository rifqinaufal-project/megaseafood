import type { Module } from "@/src/domain/dashboard";

export const moduleLabels: Record<Module, string> = {
  overview: "Overview",
  lapak: "Lapak",
  resto: "Resto & Online",
};

export const workspaceNavLabels: Record<Module, readonly string[]> = {
  overview: ["Aktivitas", "Laporan"],
  lapak: [
    "Dashboard",
    "Batch",
    "Penjualan",
    "Komisi",
    "Pengadaan",
    "Pengeluaran",
  ],
  resto: [
    "Dashboard",
    "Stok",
    "Invoice",
    "Pembayaran",
    "Utang",
    "Pengeluaran",
    "Restoran",
    "Supplier",
    "Laporan",
    "Pengaturan",
  ],
};
