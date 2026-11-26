"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Check, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/src/presentation/auth/use-auth";
import { settingsHref } from "@/src/shell/nav";
import { useTheme, type ThemePreference } from "@/src/shell/theme-provider";
import { useDismiss } from "@/src/shell/use-dismiss";

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Terang" },
  { value: "dark", label: "Gelap" },
  { value: "system", label: "Ikuti sistem" },
];

export function ProfileMenu() {
  const { snapshot, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(root, open, close);

  if (snapshot.status !== "authenticated") return null;
  const { username } = snapshot;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu akun ${username}`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 text-text hover:bg-surface-2"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-fg">
          {username.slice(0, 2).toUpperCase()}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">{username}</span>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-56 rounded-2xl border border-border bg-surface p-2 shadow-sm">
          <Link
            href={settingsHref}
            role="menuitem"
            onClick={close}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-text hover:bg-surface-2"
          >
            <Settings size={16} strokeWidth={1.75} aria-hidden />
            Pengaturan
          </Link>

          <div role="group" aria-label="Tema" className="my-1 border-t border-border pt-1">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={preference === option.value}
                onClick={() => setPreference(option.value)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-text hover:bg-surface-2"
              >
                <span className="flex-1">{option.label}</span>
                {preference === option.value && <Check size={16} className="text-primary" aria-hidden />}
              </button>
            ))}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              logout();
            }}
            className="flex w-full items-center gap-3 rounded-xl border-t border-border px-3 py-2 pt-3 text-left text-sm text-danger hover:bg-danger-soft"
          >
            <LogOut size={16} strokeWidth={1.75} aria-hidden />
            Keluar
          </button>
        </div>
      )}
    </div>
  );
}
