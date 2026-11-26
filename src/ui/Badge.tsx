import type { HTMLAttributes } from "react";
import { cx } from "@/src/ui/cx";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "primary";

const toneClass: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-text-muted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  primary: "bg-primary-soft text-primary",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        toneClass[tone],
        className,
      )}
      {...rest}
    />
  );
}
