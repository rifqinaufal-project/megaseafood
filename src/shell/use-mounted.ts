"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// Bernilai false saat render di server dan saat hydration, true setelah itu.
// Dipakai agar ikon yang bergantung pada localStorage tidak memicu mismatch.
export function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
