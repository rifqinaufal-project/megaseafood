"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "@/src/shell/theme-provider";
import { useMounted } from "@/src/shell/use-mounted";

const nextPreference: Record<ThemePreference, ThemePreference> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const labels: Record<ThemePreference, string> = {
  light: "Terang",
  dark: "Gelap",
  system: "Ikuti sistem",
};

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const mounted = useMounted();
  const current = mounted ? preference : "system";
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;

  return (
    <button
      type="button"
      onClick={() => setPreference(nextPreference[current])}
      aria-label={`Tema: ${labels[current]}. Ganti tema`}
      title={`Tema: ${labels[current]}`}
      className="flex size-10 items-center justify-center rounded-full border border-border bg-surface text-text-muted hover:text-text active:scale-[0.98]"
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
