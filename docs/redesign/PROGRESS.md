# Redesign megaseafood — PROGRESS

> Diperbarui di akhir setiap sesi. Fakta status selalu dicek ulang dengan `git log` / `git status`.

## Langkah berikutnya

**Tahap 1 — Audit logika di UI** (sesi baru, mulai dari sini):
1. Verifikasi kandidat di checklist Tahap 1 dengan `grep` dan subagent. Jangan membaca file UI secara utuh.
2. Untuk tiap logika yang ditemukan: pindahkan ke `src/domain` sebagai fungsi murni, tulis tes, lalu ganti pemanggilnya di UI dengan fungsi itu. Perubahan perilaku tidak boleh ada.
3. Catat hasil audit di bagian "Catatan audit" di bawah.
4. Selesai: `tsc`, lint, tes, dan build lolos, commit per logika, push, perbarui file ini.

## Checklist

### Tahap 0 — Persiapan
- [x] Commit checkpoint + tag `pre-redesign` (`516a662`)
- [x] Dokumen rencana di `docs/redesign/` + bagian di `AGENTS.md` (`edd204c`)

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
| 2026-11-26 | Rencana disusun (Plan mode) | — | Draf di folder plan, belum di repo. |
| 2026-11-26 | Tahap 0: checkpoint + tag `pre-redesign` | `516a662` | Dua perubahan belum di-commit (gradient header transparan, format `DashboardShell.tsx`). `tsc`, lint, 136 tes lolos. |
| 2026-11-26 | Tahap 0: dokumen rencana + `AGENTS.md` | `edd204c` | `docs/redesign/` berisi PLAN, DESIGN, PROGRESS. Bagian "UI redesign" ditambahkan di `AGENTS.md`, di luar blok Next.js. |
