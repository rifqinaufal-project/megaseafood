import type { HTMLAttributes } from "react";
import { cx } from "@/src/ui/cx";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-3xl border border-border bg-surface p-5", className)} {...rest} />;
}
