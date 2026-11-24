"use client";

import {
  LAPAK_PERIODS,
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
        <input
          type={period === "Bulanan" ? "month" : "date"}
          value={period === "Bulanan" ? anchor.slice(0, 7) : anchor}
          aria-label={period === "Bulanan" ? "Pilih bulan" : "Pilih tanggal"}
          onChange={(event) => {
            const value = event.target.value;
            if (!value) return;
            onAnchor(period === "Bulanan" ? `${value}-01` : value);
          }}
        />
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
      {picker}
      {switcher}
    </div>
  );
}
