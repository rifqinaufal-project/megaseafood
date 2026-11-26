import type { ReactNode } from "react";

export type SummaryStat = {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
  detailClassName?: string;
};

type SummaryStatsProps = {
  stats: readonly SummaryStat[];
  className?: string;
};

/** Shared metric row used by dashboards and workspace pages. */
export default function SummaryStats({
  stats,
  className = "",
}: SummaryStatsProps) {
  return (
    <div
      className={`resource-stats resource-stats-${stats.length} ${className}`.trim()}
    >
      {stats.map((stat) => (
        <div
          className={`resource-stat ${stat.className ?? ""}`.trim()}
          key={String(stat.label)}
        >
          <span>{stat.label}</span>
          <strong>{stat.value}</strong>
          {stat.detail ? (
            <small className={stat.detailClassName}>{stat.detail}</small>
          ) : null}
        </div>
      ))}
    </div>
  );
}
