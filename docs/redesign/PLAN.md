# Redesign megaseafood — PLAN

> Sumber kebenaran untuk proyek redesign. Dibaca di awal SETIAP sesi bersama `PROGRESS.md`.
> Keputusan di bagian "Keputusan terkunci" tidak boleh diubah agent tanpa persetujuan user.

## Tujuan

Menulis ulang seluruh UI (lapisan tampilan) dengan:
- App Router asli (satu route = satu halaman), bukan catch-all `app/dashboard/[[...segments]]`.
- Layout sidebar + pemilih bisnis, tanpa header tab Overview/Lapak/Resto.
- Gaya komponen ala referensi "fitonist" (pill, kartu bulat, angka besar tipis), warna navy, light + dark mode.
- Halaman ringkas: satu halaman satu tugas, minim kartu.
- File kecil dan per fitur.

Model bisnis, logika domain, penyimpanan data, API, dan auth **tidak berubah**.

## Keputusan terkunci

| # | Keputusan |
|---|---|
| K1 | Repo yang sama. UI baru ditulis dari nol berdampingan dengan UI lama, lalu UI lama dihapus. Tidak ada repo baru. |
| K2 | Warna brand tetap **navy** (`#1c3a6e`). Gaya komponen mengikuti referensi fitonist. Wajib light + dark mode. |
| K3 | Styling pakai **Tailwind v4** (sudah terpasang). `app/globals.css` lama tidak dilanjutkan, dihapus di akhir. |
| K4 | Font diganti ke **Plus Jakarta Sans** (via `next/font`). |
| K5 | Sidebar ala referensi "Synerque": logo, **dropdown pemilih bisnis** (Lapak / Resto & Online), menu bisnis aktif. Sidebar bisa dilipat jadi ikon dengan tooltip. Mobile: drawer. |
| K6 | Kanan atas (baris tipis, bukan header penuh): tombol cari (⌘K), tombol tema, pill profil (menu: Pengaturan, Tema, Keluar). |
| K7 | **Overview gabungan dihapus.** Tiap bisnis punya Dashboard sendiri. |
| K8 | Lapak: Komisi & Pengeluaran digabung ke **detail Batch** (tab). |
| K9 | Resto: Pembayaran + Utang + Pengeluaran → **Keuangan** (tab). Restoran + Supplier → **Kontak** (tab). Pengaturan Resto pindah ke Pengaturan umum, dibuka dari menu profil (keputusan user: pengaturan ini jadi general). |
| K10 | Tanpa mockup terpisah. Halaman Batch (Lapak) dibangun pertama sebagai "mockup hidup" untuk direview user di browser. |
| K11 | Aturan bisnis yang sudah ada tetap berlaku (lihat bagian bawah). |

## Navigasi baru

Lapak (5 menu):
- Dashboard — `/lapak`
- Batch — `/lapak/batch`, detail `/lapak/batch/[batchId]` (tab: Komisi, Pengeluaran)
- Tagihan — `/lapak/tagihan`
- Pengadaan — `/lapak/pengadaan`
- Laporan — `/lapak/laporan`

Resto & Online (6 menu):
- Dashboard — `/resto`
- Invoice — `/resto/invoice`, detail `/resto/invoice/[invoiceId]`, buat/edit sebagai route sendiri
- Stok — `/resto/stok`
- Keuangan — `/resto/keuangan` (tab: Pembayaran, Utang, Pengeluaran; tab via URL)
- Kontak — `/resto/kontak` (tab: Restoran, Supplier; tab via URL)
- Laporan — `/resto/laporan`

Umum:
- Pengaturan — `/pengaturan` (berisi Pengaturan Resto lama + preferensi tema)
- `/` → redirect ke bisnis terakhir dipakai (default `/lapak`)
- URL lama `/dashboard/...` → redirect ke URL baru (permanen setelah migrasi selesai)

Tab dan filter disimpan di URL (`?tab=`, `?periode=`, `?tanggal=`) supaya bisa dibagikan dan tombol back bekerja.

## Struktur folder target

```
app/
  (app)/
    layout.tsx               AuthGate + providers (data bisnis, toast, tema) + AppShell
    lapak/layout.tsx         set bisnis aktif = lapak
    lapak/page.tsx, batch/, batch/[batchId]/, tagihan/, pengadaan/, laporan/
    resto/layout.tsx
    resto/page.tsx, invoice/, invoice/[invoiceId]/, stok/, keuangan/, kontak/, laporan/
    pengaturan/page.tsx
  api/...                    TETAP
  preview/invoices/[token]   TETAP (boleh dirapikan di akhir)
  dashboard/[[...segments]]  LAMA → jadi redirect, lalu dihapus
src/
  ui/                        komponen dasar Tailwind (tanpa logika bisnis)
  shell/                     AppShell, Sidebar, BusinessSwitcher, TopBar, ThemeToggle, CommandSearch
  features/
    lapak/<halaman>/         komponen halaman + form + hook kecil
    resto/<halaman>/
  domain/ application/ infrastructure/   TETAP (boleh ditambah fungsi + tes)
  presentation/              LAMA → dihapus di tahap akhir
```

Aturan ukuran: target < 300 baris per file, batas keras 400. Satu komponen halaman, form terpisah, logika hitung di `domain`.

## Aturan kerja (wajib untuk setiap sesi)

1. **Mulai sesi:** baca `docs/redesign/PLAN.md`, `docs/redesign/PROGRESS.md`; jalankan `git status` dan `git log --oneline -5`. Fakta diambil dari git, bukan dari ingatan atau ringkasan percakapan.
2. **Satu sesi = satu item** di checklist `PROGRESS.md`. Jangan melanjutkan item berikutnya di sesi yang sama kecuali item kecil.
3. **Jangan baca** `src/presentation/**` atau `app/globals.css` secara utuh. Kalau perlu tahu perilaku lama, pakai `grep` terarah atau subagent yang melaporkan ringkasan.
4. **Logika bisnis tidak ditulis di komponen.** Kalau butuh perhitungan baru, taruh di `src/domain` + tes.
5. **Next.js 16:** sebelum memakai API Next (layout, route group, redirect, `next/font`, metadata, searchParams, dll.), baca panduan terkait di `node_modules/next/dist/docs/`.
6. **Selesai item:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` harus lolos → commit (satu item satu commit) → push → perbarui `PROGRESS.md` (centang, log, "langkah berikutnya" yang spesifik).
7. **Bukti, bukan klaim:** laporan selesai menyertakan hash commit, hasil tes, dan untuk UI screenshot desktop + mobile, light + dark (Chrome headless, perlu sesi login atau halaman uji).
8. **Jangan stage** file pribadi yang tidak dilacak: `CleanShot 2026-11-09 at 11.36.44@2x.png`, `Seafood Business Management System v2.md`, `Sultan Seafood Business Management System v3 (1).md`.
9. UI lama harus tetap berjalan sampai penggantinya selesai. Aplikasi tidak boleh rusak di commit mana pun.
10. Port 3001 = dev server megaseafood. Port 3000 milik proyek lain, jangan dihentikan.

## Aturan bisnis yang tidak boleh hilang

- Produk dengan stok: perilaku stok & HPP (moving average) tetap. Produk non-stok memakai `manualCost`; item invoice non-stok menyimpan snapshot HPP dari `manualCost` saat invoicing.
- Label switch stok: "Kelola stok produk ini". Mematikan → konfirmasi, riwayat stok tetap. Menyalakan → wajib HPP awal.
- Buku Tagihan dikelompokkan per pelanggan. Restan adalah saldo riil pelanggan, tidak menyusut karena filter periode.
- Periode Lapak: Harian / Mingguan / Bulanan / Semua, panah prev/next, "Hari ini". Default Harian, hari ini.
- Pengadaan & Bengkelan terpisah dari perhitungan profit.
- Pembayaran pengadaan 3 tahap (payment1–3).
- Daftar batch: tabel datar, urut terbaru, tanpa pemisah hari/bulan.
- Baris kartu ringkasan tidak boleh menyisakan satu kartu sendirian (4 kartu: 4 kolom desktop, 2×2 di bawahnya).
