import Link from "next/link";
import { cx } from "@/src/ui/cx";

export type TabItem = { label: string; href: string; active: boolean; count?: number };

/** Tab berbasis URL: setiap tab adalah tautan (`?tab=...`), jadi tombol back dan bagikan tautan tetap bekerja. */
export function Tabs({ label, items, className }: { label: string; items: TabItem[]; className?: string }) {
  return (
    <nav aria-label={label} className={cx("inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface-2 p-1", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "page" : undefined}
          className={cx(
            "inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap transition-[background-color,color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            item.active ? "bg-primary text-primary-fg" : "text-text-muted hover:text-text",
          )}
        >
          {item.label}
          {item.count !== undefined && <span className="tabular-nums opacity-70">{item.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
