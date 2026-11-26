"use client";

import { useEffect, useRef } from "react";

/** Menyinkronkan prop `open` dengan elemen <dialog> native (focus trap dan Escape dari browser). */
export function useNativeDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);

  return ref;
}
