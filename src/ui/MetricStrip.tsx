import type { ReactNode } from "react";
import { cx } from "@/src/ui/cx";

export type MetricItem = {
  label: string;
  value: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
};

const toneClass = {
  default: "text-text",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

// Aturan PLAN: tidak boleh menyisakan satu kartu sendirian.
const layoutClass: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-1 md:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
};

export type MetricStripProps = {
  items: MetricItem[];
  className?: string;
};

/** Ringkasan angka satu baris, maksimal 4 angka. Tanpa kartu tambahan. */
export function MetricStrip({ items, className }: MetricStripProps) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-5", layoutClass[items.length] ?? layoutClass[4], className)}>
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-1">
          <dt className="text-[13px] text-text-muted">{item.label}</dt>
          <dd className={cx("text-3xl font-light tracking-tight tabular-nums", toneClass[item.tone ?? "default"])}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
