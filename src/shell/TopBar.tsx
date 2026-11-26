"use client";

import { useEffect, useState } from "react";
import { Menu, Search } from "lucide-react";
import { CommandSearch } from "@/src/shell/CommandSearch";
import { ProfileMenu } from "@/src/shell/ProfileMenu";
import { ThemeToggle } from "@/src/shell/ThemeToggle";
import { IconButton } from "@/src/ui/IconButton";

type TopBarProps = {
  onOpenMenu: () => void;
};

export function TopBar({ onOpenMenu }: TopBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
        <IconButton label="Cari (⌘K)" onClick={() => setSearchOpen(true)}>
          <Search size={18} strokeWidth={1.75} aria-hidden />
        </IconButton>
        <ThemeToggle />
        <ProfileMenu />
      </div>
      <CommandSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
