"use client";

import { Menu } from "lucide-react";
import { ProfileMenu } from "@/src/shell/ProfileMenu";
import { ThemeToggle } from "@/src/shell/ThemeToggle";

type TopBarProps = {
  onOpenMenu: () => void;
};

export function TopBar({ onOpenMenu }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 bg-bg/80 px-4 backdrop-blur md:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Buka menu"
        className="flex size-10 items-center justify-center rounded-full border border-border bg-surface text-text-muted hover:text-text md:hidden"
      >
        <Menu size={18} strokeWidth={1.75} aria-hidden />
      </button>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <ProfileMenu />
      </div>
    </header>
  );
}
