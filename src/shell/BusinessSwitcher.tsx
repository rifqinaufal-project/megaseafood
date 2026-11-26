"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { businesses, type Business } from "@/src/shell/nav";
import { useDismiss } from "@/src/shell/use-dismiss";

type BusinessSwitcherProps = {
  active: Business;
  collapsed: boolean;
  onNavigate?: () => void;
};

export function BusinessSwitcher({ active, collapsed, onNavigate }: BusinessSwitcherProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(root, open, close);

  const ActiveIcon = active.icon;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={collapsed ? `Bisnis: ${active.name}` : undefined}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-12 w-full items-center gap-3 rounded-2xl border border-border bg-surface-2 px-2 text-left text-text hover:bg-surface ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg">
          <ActiveIcon size={16} strokeWidth={1.75} aria-hidden />
        </span>
        {!collapsed && (
          <>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">{active.name}</span>
              <span className="truncate text-xs text-text-muted">{active.description}</span>
            </span>
            <ChevronsUpDown size={16} className="shrink-0 text-text-muted" aria-hidden />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-40 w-72 rounded-2xl border border-border bg-surface p-2 shadow-sm ${
            collapsed ? "left-full top-0 ml-3" : "left-0 right-0 top-full mt-2"
          }`}
        >
          {businesses.map((business) => {
            const Icon = business.icon;
            const isActive = business.id === active.id;
            return (
              <Link
                key={business.id}
                href={business.href}
                role="menuitem"
                aria-current={isActive ? "true" : undefined}
                onClick={() => {
                  close();
                  onNavigate?.();
                }}
                className="flex items-center gap-3 rounded-xl px-2 py-2 text-text hover:bg-surface-2"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg">
                  <Icon size={16} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="text-sm font-semibold">{business.name}</span>
                  <span className="text-xs text-text-muted">{business.description}</span>
                </span>
                {isActive && <Check size={16} className="shrink-0 text-primary" aria-hidden />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
