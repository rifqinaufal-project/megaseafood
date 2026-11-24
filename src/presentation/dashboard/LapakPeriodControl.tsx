"use client";

import {
  LAPAK_PERIODS,
  periodLabel,
  type LapakPeriod,
} from "@/src/domain/lapak-periods";

type Props = {
  period: LapakPeriod;
  anchor: string;
  onPeriod: (period: LapakPeriod) => void;
  onAnchor: (anchor: string) => void;
};

/**
 * One shared period switcher for the Lapak pages: Harian, Mingguan, Bulanan, or Semua.
 * In "Semua" there is no date input because the whole book is shown, grouped by month.
 */
export default function LapakPeriodControl({
  period,
  anchor,
  onPeriod,
  onAnchor,
}: Props) {
  return (
    <div
      className="lapak-period-control"
      role="group"
      aria-label="Periode data Lapak"
    >
      <div className="lapak-period-switch">
        {LAPAK_PERIODS.map((option) => (
          <button
            key={option}
            className={`lapak-period-button${option === period ? " is-active" : ""}`}
            type="button"
            aria-pressed={option === period}
            onClick={() => onPeriod(option)}
          >
            {option}
          </button>
        ))}
      </div>
      {period === "Semua" ? (
        <span className="lapak-period-caption">Dikelompokkan per bulan</span>
      ) : (
        <label className="lapak-period-date">
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
      )}
      <span className="lapak-period-caption">
        {periodLabel(period, anchor)}
      </span>
    </div>
  );
}
