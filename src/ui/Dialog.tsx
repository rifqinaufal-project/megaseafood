"use client";

import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/src/ui/IconButton";
import { cx } from "@/src/ui/cx";
import { useNativeDialog } from "@/src/ui/use-native-dialog";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClass = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export function Dialog({ open, onClose, title, description, children, footer, size = "md", className }: DialogProps) {
  const ref = useNativeDialog(open);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cx(
        "m-auto w-[calc(100%-2rem)] rounded-3xl border border-border bg-surface p-0 text-text shadow-sm backdrop:bg-text/30",
        sizeClass[size],
        className,
      )}
    >
      <div className="flex flex-col gap-5 p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="text-sm text-text-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Tutup" onClick={onClose}>
            <X size={18} strokeWidth={1.75} aria-hidden />
          </IconButton>
        </header>
        {children && <div className="flex flex-col gap-4">{children}</div>}
        {footer && <footer className="flex flex-wrap justify-end gap-2">{footer}</footer>}
      </div>
    </dialog>
  );
}
