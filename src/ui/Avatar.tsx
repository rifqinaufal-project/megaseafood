import { cx } from "@/src/ui/cx";

export function Avatar({ initials, size = "md", className }: { initials: string; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-fg",
        size === "sm" ? "size-8 text-xs" : "size-10 text-sm",
        className,
      )}
    >
      {initials}
    </span>
  );
}
