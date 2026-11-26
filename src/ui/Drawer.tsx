"use client";

import type { ReactNode } from "react";
import { cx } from "@/src/ui/cx";
import { useNativeDialog } from "@/src/ui/use-native-dialog";

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
};

/** Panel dari kiri, dipakai sebagai menu di layar kecil. */
export function Drawer({ open, onClose, label, children, className }: DrawerProps) {
  const ref = useNativeDialog(open);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cx(
        "fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-[280px] max-w-[85vw] border-r border-border bg-surface p-0 text-text backdrop:bg-text/30",
        className,
      )}
    >
      {children}
    </dialog>
  );
}
