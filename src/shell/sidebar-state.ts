"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "megaseafood-sidebar-collapsed";
const listeners = new Set<() => void>();

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function setSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Penyimpanan tidak tersedia: status lipat hanya berlaku untuk sesi ini.
  }
  listeners.forEach((listener) => listener());
}

export function useSidebarCollapsed() {
  return useSyncExternalStore(subscribe, readCollapsed, () => false);
}
