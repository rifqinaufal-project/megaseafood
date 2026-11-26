// Parsing dan validasi input form multi-item (Komisi, Pengeluaran, Pengadaan).
// Fungsi di file ini murni: tidak tahu tentang React, state, atau halaman.
// Aturan di sini mencerminkan perilaku form UI, termasuk input kosong yang dibaca sebagai 0.

export type FormItem = Record<string, string>;

// Angka biasa, mis. bobot. Input kosong atau tidak valid menjadi 0.
export function asNumber(value: string): number {
  return Number(value) || 0;
}

// Uang format Indonesia: "1.500.000,5" menjadi 1500000.5. Input kosong menjadi 0.
export function asMoney(value: string): number {
  return Number(value.replace(/\./g, "").replace(",", ".")) || 0;
}

// Angka rupiah utuh dari input teks, mis. "1.500.000" menjadi 1500000. Input tidak valid menjadi 0.
export function asWholeRupiah(value: string): number {
  return Number(value.replaceAll(".", "").replaceAll(/[^\d]/g, "")) || 0;
}

// Validasi satu item form. Mengembalikan pesan error, atau null jika item valid.
// `hasBatch` diisi pemanggil: apakah `item.batchId` cocok dengan batch yang tersedia.
export function validateFormItem(page: string, item: FormItem, hasBatch: boolean): string | null {
  const needsBatch = ["Commission", "Expenses"].includes(page);
  if (needsBatch && !hasBatch) return "Pilih batch Lapak yang tersedia";
  if (
    page === "Commission" &&
    (!item.partner?.trim() || asMoney(item.amount || "") === 0)
  )
    return "Partner dan jumlah komisi wajib diisi; komisi boleh positif atau negatif";
  if (
    page === "Expenses" &&
    (!item.expenseName?.trim() || asMoney(item.amount || "") <= 0)
  )
    return "Nama dan jumlah pengeluaran wajib diisi";
  if (
    page === "Sourcing & Bengkelan" &&
    (!item.name?.trim() ||
      !item.type?.trim() ||
      asNumber(item.weight || "0") <= 0 ||
      asMoney(item.price || "") <= 0 ||
      asMoney(item.payment1 || "") < 0 ||
      asMoney(item.payment2 || "") < 0 ||
      asMoney(item.payment3 || "") < 0)
  )
    return "Nama, jenis, bobot, dan harga pengadaan wajib valid";
  return null;
}
