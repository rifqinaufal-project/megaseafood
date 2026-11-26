import type { ReactNode } from "react";
import { cx } from "@/src/ui/cx";

/** Label kecil di sisi kanan elemen. Muncul saat hover atau fokus. Elemen di dalamnya harus punya nama aksesibel sendiri. */
export function Tooltip({ content, children, className }: { content: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx("group relative inline-flex max-w-full", className)}>
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-full bg-text px-3 py-1 text-xs text-bg opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
