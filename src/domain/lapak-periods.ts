/**
 * Period handling for the Lapak module (Tagihan, Komisi, Pengadaan, Pengeluaran).
 * Pages can be read per day, per week, per month, or as the whole book grouped by month.
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

const DAY_LABELS = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;

export const LAPAK_PERIODS = [
  "Harian",
  "Mingguan",
  "Bulanan",
  "Semua",
] as const;
export type LapakPeriod = (typeof LAPAK_PERIODS)[number];

/** Shared labels so the Dashboard and the Lapak pages never drift apart. */
export const PERIOD_LABELS: Record<LapakPeriod, string> = {
  Harian: "Harian",
  Mingguan: "Mingguan",
  Bulanan: "Bulanan",
  Semua: "Semua",
};

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

/** `2026-11-20` becomes `20 November 2026`. */
export const dayLabel = (date: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  if (!match) return date || "Tanpa tanggal";
  return `${Number(match[3])} ${MONTH_LABELS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
};

/** Shift a `YYYY-MM-DD` string without going through time zones. */
export const shiftDays = (date: string, days: number) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  if (!match) return date;
  const shifted = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
  );
  return shifted.toISOString().slice(0, 10);
};

/** Monday of the week that contains `date`; the business week starts on Monday. */
export const startOfWeek = (date: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  if (!match) return date;
  const weekday = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  ).getUTCDay();
  return shiftDays(date, -((weekday + 6) % 7));
};

export type DateRange = { from: string; to: string };

/** First and last day of the month that contains `date`. */
export const monthBounds = (date: string): DateRange => {
  const match =
    /^(\d{4})-(\d{2})/.exec(date || "") || /^(\d{4})$/.exec(date || "");
  if (!match) return { from: "", to: "" };
  const year = match[1];
  const month = match[2] ?? "01";
  const lastDay = new Date(
    Date.UTC(Number(year), Number(month), 0),
  ).getUTCDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
};

/** Monday–Sunday week that contains `date`. */
export const weekBounds = (date: string): DateRange => {
  const from = startOfWeek(date);
  return { from, to: shiftDays(from, 6) };
};

/**
 * Resolves the inclusive date range of a period around `anchor`.
 * "Semua" returns null because the whole book is shown and grouped by month instead.
 */
export function periodRange(
  period: LapakPeriod,
  anchor: string,
): DateRange | null {
  if (period === "Harian") return anchor ? { from: anchor, to: anchor } : null;
  if (period === "Mingguan") return weekBounds(anchor);
  if (period === "Bulanan") return monthBounds(anchor);
  return null;
}

/** Human label for the range being shown, e.g. "Senin, 24 November 2026" or "23–29 November 2026". */
export function periodLabel(period: LapakPeriod, anchor: string): string {
  if (period === "Semua") return "Semua periode";
  const range = periodRange(period, anchor);
  if (!range) return "Semua periode";
  if (period === "Harian") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(range.from);
    const weekday = match
      ? DAY_LABELS[
          new Date(
            Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
          ).getUTCDay()
        ]
      : "";
    return weekday
      ? `${weekday}, ${dayLabel(range.from)}`
      : dayLabel(range.from);
  }
  if (period === "Bulanan") return monthLabel(monthKey(range.from));
  const sameMonth = monthKey(range.from) === monthKey(range.to);
  if (sameMonth) {
    const from = Number(range.from.slice(8, 10));
    const to = Number(range.to.slice(8, 10));
    return `${from}–${to} ${monthLabel(monthKey(range.from))}`;
  }
  return `${dayLabel(range.from)} – ${dayLabel(range.to)}`;
}

export const inRange = (date: string, range: DateRange | null) =>
  !range || (date >= range.from && date <= range.to);

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
