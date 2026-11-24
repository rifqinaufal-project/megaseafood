"use client";

import {
  LAPAK_PERIODS,
  MONTH_LABELS,
  PERIOD_LABELS,
  periodLabel,
  type LapakPeriod,
} from "@/src/domain/lapak-periods";

type Props = {
  period: LapakPeriod;
  anchor: string;
  onPeriod: (period: LapakPeriod) => void;
  onAnchor: (anchor: string) => void;
  /** Hide the date input when the page groups by month instead of picking a range. */
  showAnchor?: boolean;
  /** "heading": switcher sits in the page header, like the Dashboard. "bar": own row above the content. */
  variant?: "heading" | "bar";
};

/**
 * One shared period switcher for the Lapak pages: Harian, Mingguan, Bulanan, or Semua.
 * It reuses the Dashboard's `.period-switcher` look so every Lapak screen reads the same.
 * In "Semua" there is no date input because the whole book is shown, grouped by month.
 */
export default function LapakPeriodControl({
  period,
  anchor,
  onPeriod,
  onAnchor,
  showAnchor = true,
  variant = "heading",
}: Props) {
  const year = Number(anchor.slice(0, 4)) || new Date().getFullYear();
  const month = anchor.slice(5, 7) || "01";
  const years = Array.from({ length: 11 }, (_, index) => year - 5 + index);
  const picker =
    showAnchor && period !== "Semua" ? (
      <label className="period-picker">
        <span>
          {period === "Harian"
            ? "Tanggal"
            : period === "Mingguan"
              ? "Minggu berisi tanggal"
              : "Bulan"}
        </span>
        {period === "Bulanan" ? (
          <span className="period-month-picker">
            <select
              value={month}
              aria-label="Pilih bulan"
              onChange={(event) => onAnchor(`${year}-${event.target.value}-01`)}
            >
              {MONTH_LABELS.map((label, index) => (
                <option key={label} value={String(index + 1).padStart(2, "0")}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={String(year)}
              aria-label="Pilih tahun"
              onChange={(event) =>
                onAnchor(`${event.target.value}-${month}-01`)
              }
            >
              {years.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </span>
        ) : (
          <input
            type="date"
            value={anchor}
            aria-label="Pilih tanggal"
            onChange={(event) =>
              event.target.value && onAnchor(event.target.value)
            }
          />
        )}
      </label>
    ) : null;

  const switcher = (
    <div
      className="period-switcher"
      role="group"
      aria-label="Periode data Lapak"
    >
      {LAPAK_PERIODS.map((option) => (
        <button
          key={option}
          className={option === period ? "active" : ""}
          type="button"
          aria-pressed={option === period}
          onClick={() => onPeriod(option)}
        >
          {PERIOD_LABELS[option]}
        </button>
      ))}
    </div>
  );

  if (variant === "bar")
    return (
      <div className="lapak-period-bar" role="group" aria-label="Pilih periode">
        {switcher}
        {picker}
        <span className="period-caption lapak-period-caption">
          {period === "Semua"
            ? "Dikelompokkan per bulan"
            : periodLabel(period, anchor)}
        </span>
      </div>
    );

  return (
    <div className="lapak-period-head">
      {switcher}
      {picker}
    </div>
  );
}
