# Redesign megaseafood — DESIGN

> Bahasa visual. Referensi: "fitonist" (gaya komponen) dan "Synerque" (layout sidebar).
> Warna brand tetap navy. Light dan dark wajib setara.

## Prinsip

1. Satu halaman, satu tugas. Pola tetap: **Judul + aksi utama → filter/periode → tabel/daftar → total**.
2. Minim kartu. Ringkasan angka maksimal satu baris (`MetricStrip`, ≤ 4 angka) atau total di footer tabel.
3. Info sekunder ke tab, drawer, atau halaman detail, bukan kartu tambahan.
4. Bentuk membulat: pill untuk kontrol, kartu radius besar, tombol ikon bulat.
5. Angka besar tipis (weight 300–400, tracking rapat). Label kecil, warna redup.
6. Tidak ada gradient dekoratif. Bayangan sangat halus (light) atau tidak ada (dark, pakai border).

## Token warna (CSS variables, dipetakan ke Tailwind `@theme`)

Nilai awal, boleh disetel saat fondasi asal kontras teks ≥ 4.5:1.

| Token | Light | Dark | Pemakaian |
|---|---|---|---|
| `--bg` | `#F2F3F6` | `#0A0B0D` | latar halaman |
| `--surface` | `#FFFFFF` | `#131418` | kartu, sidebar, tabel |
| `--surface-2` | `#F6F7F9` | `#1B1D22` | baris di dalam kartu, input, hover |
| `--border` | `rgb(15 23 42 / 0.08)` | `rgb(255 255 255 / 0.08)` | garis tipis |
| `--text` | `#0F172A` | `#F3F4F6` | teks utama |
| `--text-muted` | `#5C6A7E` | `#9CA3AF` | label, keterangan (4,96:1 di `--bg`, disetel dari `#64748B` yang hanya 4,29:1) |
| `--primary` | `#1C3A6E` (navy) | `#8FB0E8` (navy terang) | tombol utama, menu aktif, fokus |
| `--primary-fg` | `#FFFFFF` | `#0A0B0D` | teks di atas primary |
| `--primary-soft` | `#EEF2F8` | `rgb(143 176 232 / 0.14)` | latar menu aktif, chip |
| `--success` | `#15803D` | `#6EE7A8` | lunas, profit, naik |
| `--success-soft` | `#DCFCE7` | `rgb(110 231 168 / 0.14)` | badge |
| `--warning` | `#B45309` | `#F5D67B` | sebagian, menipis |
| `--warning-soft` | `#FEF3C7` | `rgb(245 214 123 / 0.14)` | badge |
| `--danger` | `#B91C1C` | `#F87171` | belum lunas, rugi, hapus |
| `--danger-soft` | `#FEE2E2` | `rgb(248 113 113 / 0.14)` | badge |

Aksen bisnis (dipakai di dropdown pemilih bisnis dan ikon bisnis):
- Lapak: navy (`--primary`).
- Resto & Online: sama dengan Lapak, navy (`--primary`). Keputusan user, pembeda antar bisnis cukup lewat nama dan ikon.

Aturan: **tidak ada warna hex di komponen.** Semua lewat token/kelas Tailwind dari token.

## Tema

- Pilihan: Terang / Gelap / Ikuti sistem. Disimpan (cookie atau localStorage).
- Diterapkan lewat atribut `data-theme` di `<html>` **sebelum paint** (tanpa kedipan). Cara pastinya untuk Next 16 dicek di `node_modules/next/dist/docs/` saat fondasi.
- Tailwind v4: varian `dark:` diarahkan ke `[data-theme="dark"]` (custom variant).

## Tipografi

- Font: Plus Jakarta Sans (`next/font/google`), angka tabular (`font-variant-numeric: tabular-nums`) untuk kolom uang.
- Skala: judul halaman 24/28, judul kartu 16–18, teks 14, label 12–13, angka metrik 28–36 weight 300–400.

## Bentuk dan ukuran

| Elemen | Radius | Tinggi |
|---|---|---|
| Kartu / panel | 24px | — |
| Baris dalam kartu, input | 14–16px | input 44px |
| Tombol | pill (999px) | 40–44px |
| Tombol ikon | lingkaran | 40px |
| Segmented / tab | pill, item aktif pill terisi | 40px |
| Badge | pill | 22–24px |

Segmented aktif: light = `--primary` dengan teks putih; dark = putih/`--text` dengan teks gelap (meniru fitonist).

## Komponen dasar (`src/ui`)

`Button` (primary, secondary, ghost, danger; ukuran sm/md), `IconButton`, `Card`, `Segmented`, `Tabs` (berbasis URL), `Badge` (neutral/success/warning/danger/primary), `MetricStrip`, `DataTable` (header, baris klik, footer total, empty state, mode kartu di mobile), `Field` + `Input`/`Select`/`Textarea`/`MoneyInput`, `Dialog`, `Drawer`, `Confirm`, `EmptyState`, `Toast`, `PeriodControl` (Harian/Mingguan/Bulanan/Semua + panah + Hari ini), `Avatar`, `Tooltip`.

## Layout

- Sidebar lebar ±264px; dilipat ±76px (ikon + tooltip). Status lipat disimpan.
- Isi sidebar: logo "megaseafood" → dropdown bisnis (pill/kotak, ikon ⇅) → menu bisnis aktif → (bawah) tombol lipat.
- Dropdown bisnis: popover berisi 2 baris, tiap baris ikon bulat berwarna aksen + nama + keterangan kecil.
- Area konten: baris atas tipis (kanan: cari, tema, profil), lalu konten dengan lebar maks ±1280px.
- Mobile (< 768px): sidebar jadi drawer dari tombol ☰; tabel jadi daftar kartu.
