/**
 * Month grouping for the Lapak module (Tagihan, Komisi, Pengadaan, Pengeluaran).
 * Every page groups its records by month so the monthly subtotals line up with the
 * way the business owner reviews the book each month.
 */

export const MONTH_LABELS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

/** `2026-11-20` becomes `2026-11`, the grouping key. */
export const monthKey = (date: string) => {
  const match = /^(\d{4})-(\d{2})/.exec(date || "");
  return match ? `${match[1]}-${match[2]}` : "";
};

/** `2026-11` becomes `November 2026`. */
export const monthLabel = (key: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key || "Tanpa tanggal";
  return `${MONTH_LABELS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
};

/** Short form for compact headers: `Nov 2026`. */
export const monthShortLabel = (key: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key || "Tanpa tanggal";
  return `${MONTH_LABELS[Number(match[2]) - 1]?.slice(0, 3) ?? match[2]} ${match[1]}`;
};

export type MonthGroup<T> = {
  key: string;
  label: string;
  shortLabel: string;
  items: T[];
  total: number;
};

/**
 * Groups records by month, newest month first. Records without a valid date are kept
 * together in a trailing "Tanpa tanggal" group so nothing ever disappears from the page.
 * The `pickAmount` callback decides what a month's total means (nominal, komisi, sisa, ...).
 */
export function groupByMonth<T>(
  items: readonly T[],
  pickDate: (item: T) => string,
  pickAmount: (item: T) => number = () => 0,
): MonthGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = monthKey(pickDate(item));
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => {
      if (!a) return 1;
      if (!b) return -1;
      return b.localeCompare(a);
    })
    .map(([key, groupItems]) => ({
      key,
      label: monthLabel(key),
      shortLabel: monthShortLabel(key),
      items: groupItems,
      total: groupItems.reduce((sum, item) => sum + pickAmount(item), 0),
    }));
}
