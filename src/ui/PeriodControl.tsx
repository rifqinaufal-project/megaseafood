import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/src/ui/IconButton";
import { Segmented, type SegmentedOption } from "@/src/ui/Segmented";
import { cx } from "@/src/ui/cx";

export type PeriodControlProps<T extends string> = {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Teks rentang yang sedang tampil, misalnya "Senin, 24 November 2026". */
  rangeLabel: string;
  /** Nonaktif saat periode "Semua" karena tidak ada rentang untuk digeser. */
  navigable: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  className?: string;
};

export function PeriodControl<T extends string>({
  value,
  options,
  onChange,
  rangeLabel,
  navigable,
  onPrevious,
  onNext,
  onToday,
  className,
}: PeriodControlProps<T>) {
  return (
    <div className={cx("flex flex-wrap items-center gap-3", className)}>
      <Segmented label="Periode" value={value} options={options} onChange={onChange} />
      <div className="flex items-center gap-2">
        <IconButton label="Periode sebelumnya" onClick={onPrevious} disabled={!navigable}>
          <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
        </IconButton>
        <span className="min-w-0 text-sm font-medium text-text tabular-nums" aria-live="polite">
          {rangeLabel}
        </span>
        <IconButton label="Periode berikutnya" onClick={onNext} disabled={!navigable}>
          <ChevronRight size={18} strokeWidth={1.75} aria-hidden />
        </IconButton>
        <button
          type="button"
          onClick={onToday}
          disabled={!navigable}
          className="h-10 rounded-full px-3 text-sm font-medium text-primary hover:bg-primary-soft disabled:pointer-events-none disabled:opacity-40"
        >
          Hari ini
        </button>
      </div>
    </div>
  );
}
