# Redesign megaseafood — PROGRESS

> Diperbarui di akhir setiap sesi. Fakta status selalu dicek ulang dengan `git log` / `git status`.

## Langkah berikutnya

**Tahap 1 — Audit logika di UI** (sesi baru, mulai dari sini). Sudah selesai: ledger, total pengadaan, ringkasan Resto, dan ringkasan Komisi/Pengeluaran Lapak. Berikutnya: audit perhitungan dashboard Lapak/Resto di `DashboardShell.tsx`.
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
- [x] `buildLedgerGroups`, `ledgerTotals` → `src/domain/ledger.ts` (tes: `business-integrity.test.ts`). `formatLedgerDate` tetap di UI karena murni format tampilan.
- [x] Total dibayar / sisa pengadaan → `src/domain/sourcing.ts` (`sourcingPaid`, `sourcingOutstanding`, `sourcingTotals`; tes: `tests/sourcing.test.ts`). Dipakai di `WorkspacePage.tsx` dan `overview.ts`.
- [x] Ringkasan Resto (`RestoPages.tsx`): nilai persediaan, total pembelian, utang supplier, piutang restoran → `src/domain/resto-summary.ts` (tes: `tests/resto-summary.test.ts`).
- [x] Ringkasan Komisi/Pengeluaran (`LapakSummaryCards`) → `src/domain/lapak-summary.ts` (tes: `tests/lapak-summary.test.ts`)
- [x] Validasi form di `ModalForm` / `getRows` (`WorkspacePage.tsx`) → `src/domain/form-input.ts` (`asMoney`, `asNumber`, `validateFormItem`; tes: `tests/form-input.test.ts`). `getRows` tidak diubah karena hanya memetakan baris tampilan, bukan validasi. Perilaku tidak berubah; dua aturan validasi (UI dan domain `business-commands.ts`) tetap terpisah, menunggu keputusan user.
- [x] Perhitungan editor invoice (`InvoiceWorkspace.tsx`) → `src/domain/invoice-editor-summary.ts` (`invoiceEditorSummary`, `finite`; tes: `tests/invoice-editor-summary.test.ts`). Panel samping kini hanya membaca hasil `calculateInvoice`.
- [x] Perhitungan dashboard Lapak/Resto di `DashboardShell.tsx` → `src/domain/lapak-totals.ts` (`lapakPeriodTotals`, `commissionTotalForBatch`, `expenseTotalForBatch`; tes: `tests/lapak-totals.test.ts`) dan `src/domain/resto-summary.ts` (`invoiceRevenueTotal`, `unpaidInvoices`, `unpaidInvoiceReceivable`; tes: `tests/resto-dashboard-totals.test.ts`). Piutang memakai opsi A: semua invoice belum lunas, termasuk ONLINE.
- [x] Hasil audit dicatat di bawah (bagian "Catatan audit")

### Tahap 2 — Fondasi
- [ ] Font Plus Jakarta Sans, token warna light/dark, varian `dark:`, tema tanpa kedip
- [ ] Route group `app/(app)` + layout + providers (data bisnis, toast, tema) + AuthGate
- [ ] AppShell: Sidebar (lipat + tooltip), BusinessSwitcher, TopBar (cari, tema, profil), drawer mobile
- [ ] Komponen dasar `src/ui` (lihat DESIGN.md)

### Tahap 3 — Lapak
- [ ] Batch (daftar) — **review user di browser sebelum lanjut** (pengganti mockup)
- [ ] Detail Batch + tab Komisi / Pengeluaran + form
- [x] Tagihan (sisa `reduce` di `TagihanWorkspace.tsx`: total periode, total bulan, pratinjau editor) → `src/domain/ledger.ts` (`ledgerPeriodTotals`, `ledgerMonthTotals`, `ledgerPreviewTotals`) dan `src/domain/form-input.ts` (`asWholeRupiah`); tes: `tests/ledger-totals.test.ts`
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
| 2026-11-26 | Tahap 1: logika ledger ke domain | `cb79005` | Dipindah dari `TagihanWorkspace.tsx` ke `src/domain/ledger.ts`. Perilaku tidak berubah. `tsc`, lint, 136 tes, build lolos. |
| 2026-11-26 | Tahap 1: total pengadaan ke domain | `62ed379` | `sourcing.ts` dengan tes. Rumus `payment1+2+3` di `WorkspacePage.tsx` (3 tempat + total) dan `overview.ts` (2 tempat) diganti helper. `tsc`, lint, 139 tes, build lolos. |
| 2026-11-26 | Keputusan user | `0ddd0c9` | Pengaturan Resto pindah ke Pengaturan umum (menu profil). Aksen Resto & Online = navy, sama dengan Lapak. Dicatat di PLAN.md (K9) dan DESIGN.md. |
| 2026-11-26 | Tahap 1: ringkasan Resto ke domain | `8beba49` | `resto-summary.ts` dengan tes: nilai persediaan, total pembelian, utang supplier, piutang restoran. Tujuh perhitungan di `RestoPages.tsx` diganti. `tsc`, lint, 143 tes, build lolos. Sesi ini mengerjakan tiga item, melebihi aturan satu item per sesi. |
| 2026-11-26 | Tahap 1: ringkasan Komisi/Pengeluaran Lapak ke domain | `a5effbc` | `lapak-summary.ts` dengan tes. Perhitungan `LapakSummaryCards` diganti tanpa mengubah perilaku; `tsc`, lint, 149 tes, build lolos. |
| 2026-11-26 | Tahap 1: validasi form ke domain | `cabf273` | `form-input.ts` dengan tes (6 tes baru). `validateItem`, `asMoney`, `asNumber` di `WorkspacePage.tsx` diganti pemanggilan domain. `tsc`, lint, 155 tes, build lolos. |
| 2026-11-26 | Tahap 1: perhitungan editor invoice ke domain | `6277d13` | `invoice-editor-summary.ts` dengan tes (3 tes baru). Blok ringkasan `InvoiceWorkspace.tsx` diganti pemanggilan domain. `tsc`, lint, 158 tes, build lolos. |
| 2026-11-26 | Tahap 1: piutang dashboard Resto (opsi A) ke domain | `6445125` | `resto-summary.ts`: `invoiceRevenueTotal`, `unpaidInvoices`, `unpaidInvoiceReceivable`, dengan tes (3 tes baru). Piutang = semua invoice belum lunas, termasuk ONLINE. Tahap 1 ditutup. |
| 2026-11-26 | Tahap 1: sisa reduce Tagihan ke domain | `dcb1948` | `ledgerPeriodTotals`, `ledgerMonthTotals`, `ledgerPreviewTotals`, `asWholeRupiah` dengan tes (5 tes baru). `TagihanWorkspace.tsx` memanggil helper. `tsc`, lint, 169 tes, build lolos. |
| 2026-11-26 | Tahap 1: dashboard Lapak ke domain | `b8e6cbc` | `lapak-totals.ts` dengan tes (3 tes baru). Ringkasan Lapak dan total per batch di `DashboardShell.tsx` diganti helper. `tsc`, lint, 161 tes, build lolos. Bagian Resto belum dipindah, lihat catatan audit. |

## Catatan audit

Pemetaan awal lewat grep. Perhitungan `reduce` di komponen (perkiraan jumlah):
- `TagihanWorkspace.tsx`: ~15, sebagian sudah pindah ke `ledger.ts`. Sisanya turunan total per bulan dan periode.
- `WorkspacePage.tsx`: ~14. Total pengadaan (`rows`, `paid`, `outstanding`) dan `revenueOf`/`costOf` per batch termasuk kandidat.
- `RestoPages.tsx`: ~11. Nilai inventaris, total utang, piutang per restoran.
- `DashboardShell.tsx`: ~11. Ringkasan dashboard Lapak dan Resto.
- `InvoiceWorkspace.tsx`: ~8. Turunan `calculated` (HPP, margin, profit). Sudah ada `calculateInvoice` di `domain/invoice.ts`, jadi bagian ini kemungkinan hanya ringkasan tampilan.

Semua kandidat Tahap 1 sudah dikerjakan. Tahap 1 selesai.

Keputusan yang sudah diambil user:
- **Piutang di dashboard Resto (opsi A).** Piutang = semua invoice yang belum lunas, termasuk ONLINE. Helper baru `unpaidInvoiceReceivable` dan `unpaidInvoices` di `resto-summary.ts`. `restaurantReceivableTotal` tetap untuk perhitungan piutang per restoran.

Temuan yang masih terbuka (tidak diubah, perlu keputusan user di tahap berikutnya):
- **Validasi form ganda.** `validateFormItem` (UI, `form-input.ts`) dan `validateSourcingInput` (domain, `business-commands.ts`) tidak sama aturannya. UI tidak memeriksa tanggal pembayaran dan total pembayaran. Menyatukan keduanya mengubah perilaku, jadi perlu persetujuan user.
- **Batas hitung di UI (sudah diaudit).** Sisa `reduce` di `TagihanWorkspace.tsx` (total periode, total bulan, pratinjau editor) sudah dipindah ke domain (`dcb1948`). `getRows` di `WorkspacePage.tsx` hanya memetakan data tampilan, jadi tetap di UI sesuai keputusan awal Tahap 1.
