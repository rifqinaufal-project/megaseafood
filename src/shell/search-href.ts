import type { GlobalSearchResult } from "@/src/domain/global-search";

const segment = (value: string) => encodeURIComponent(value);

/** Tujuan saat hasil pencarian dipilih. Null jika jenis data itu belum punya halaman (misalnya catatan). */
export function searchResultHref(result: GlobalSearchResult): string | null {
  switch (result.page) {
    case "Invoice":
      return result.invoiceId ? `/resto/invoice/${segment(result.invoiceId)}` : "/resto/invoice";
    case "Stok":
      return "/resto/stok";
    case "Restoran":
      return "/resto/kontak?tab=restoran";
    case "Supplier":
      return "/resto/kontak?tab=supplier";
    case "Utang":
      return "/resto/keuangan?tab=utang";
    case "Pembayaran":
      return "/resto/keuangan?tab=pembayaran";
    case "Pengadaan":
      return "/lapak/pengadaan";
    case "Tagihan":
      return "/lapak/tagihan";
    case "Batch":
      return result.batchId ? `/lapak/batch/${segment(result.batchId)}` : "/lapak/batch";
    case "Komisi":
      return result.batchId ? `/lapak/batch/${segment(result.batchId)}?tab=komisi` : "/lapak/batch";
    case "Pengeluaran":
      if (result.module === "resto") return "/resto/keuangan?tab=pengeluaran";
      return result.batchId ? `/lapak/batch/${segment(result.batchId)}?tab=pengeluaran` : "/lapak/batch";
    default:
      return null;
  }
}
