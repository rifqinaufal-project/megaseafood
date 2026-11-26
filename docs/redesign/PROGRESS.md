# Redesign megaseafood — PROGRESS

> Diperbarui di akhir setiap sesi. Fakta status selalu dicek ulang dengan `git log` / `git status`.

## Langkah berikutnya

**Tahap 0 — Persiapan** (sesi build pertama):
1. Commit perubahan yang masih terbuka sebagai titik pulih, tanpa file pribadi:
   - `app/globals.css` (gradient header jadi transparan)
   - `src/presentation/dashboard/DashboardShell.tsx` (format satu baris `topProfitBatches`)
   Pesan: "Checkpoint before UI redesign". Push. Buat tag `pre-redesign` di commit ini.
2. Pindahkan `PLAN.md`, `DESIGN.md`, `PROGRESS.md` ke `docs/redesign/`.
3. Tambahkan bagian "Redesign" di `AGENTS.md` di LUAR blok `nextjs-agent-*`:
   "Sebelum mengerjakan redesign, baca `docs/redesign/PLAN.md` dan `docs/redesign/PROGRESS.md`, ikuti Aturan kerja di PLAN."
4. Commit "Add redesign plan", push. Tutup sesi.

## Checklist

### Tahap 0 — Persiapan
- [ ] Commit checkpoint + tag `pre-redesign`
- [ ] Dokumen rencana di `docs/redesign/` + bagian di `AGENTS.md`

### Tahap 1 — Audit logika di UI
Pindahkan perhitungan/validasi yang masih di komponen ke `src/domain` + tes. Kandidat (verifikasi dulu via grep/subagent):
- [ ] `buildLedgerGroups`, `formatLedgerDate` (`TagihanWorkspace.tsx`)
- [ ] Total dibayar / sisa pengadaan (`WorkspacePage.tsx`, Sourcing)
- [ ] Ringkasan Komisi/Pengeluaran (`LapakSummaryCards`)
- [ ] Validasi form di `ModalForm` / `getRows` (`WorkspacePage.tsx`)
- [ ] Perhitungan editor invoice (`InvoiceWorkspace.tsx`)
- [ ] Perhitungan dashboard Lapak/Resto di `DashboardShell.tsx`
- [ ] Hasil audit dicatat di bawah (bagian "Catatan audit")

### Tahap 2 — Fondasi
- [ ] Font Plus Jakarta Sans, token warna light/dark, varian `dark:`, tema tanpa kedip
- [ ] Route group `app/(app)` + layout + providers (data bisnis, toast, tema) + AuthGate
- [ ] AppShell: Sidebar (lipat + tooltip), BusinessSwitcher, TopBar (cari, tema, profil), drawer mobile
- [ ] Komponen dasar `src/ui` (lihat DESIGN.md)

### Tahap 3 — Lapak
- [ ] Batch (daftar) — **review user di browser sebelum lanjut** (pengganti mockup)
- [ ] Detail Batch + tab Komisi / Pengeluaran + form
- [ ] Tagihan
- [ ] Pengadaan (pembayaran 3 tahap di drawer)
- [ ] Dashboard Lapak
- [ ] Laporan Lapak

### Tahap 4 — Resto & Online
- [ ] Invoice (daftar)
- [ ] Invoice detail + buat/edit (pecah editor besar)
- [ ] Stok (termasuk switch "Kelola stok produk ini")
- [ ] Keuangan (Pembayaran / Utang / Pengeluaran)
- [ ] Kontak (Restoran / Supplier)
- [ ] Dashboard Resto
- [ ] Laporan Resto
- [ ] Pengaturan (`/pengaturan`)

### Tahap 5 — Bersih-bersih
- [ ] Redirect semua URL `/dashboard/...` lama ke URL baru
- [ ] Hapus `src/presentation/` lama, `app/globals.css` lama (sisakan base Tailwind), route catch-all, Overview
- [ ] Sesuaikan tes render di `tests/business-integrity.test.ts`
- [ ] Rapikan preview invoice publik ke gaya baru (opsional)

## Catatan audit
(diisi di Tahap 1)

## Log sesi
| Tanggal | Item | Commit | Catatan |
|---|---|---|---|
| 2026-11-26 | Rencana disusun (Plan mode) | — | Titik awal: `main` di `5b4a749`, ada 2 file belum di-commit (lihat Langkah berikutnya). |
