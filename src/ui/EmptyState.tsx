import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cx } from "@/src/ui/cx";

export type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-center gap-3 px-6 py-14 text-center", className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-text-muted">
        {icon ?? <Inbox size={20} strokeWidth={1.75} aria-hidden />}
      </span>
      <p className="text-base font-semibold text-text">{title}</p>
      {description && <p className="max-w-sm text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
