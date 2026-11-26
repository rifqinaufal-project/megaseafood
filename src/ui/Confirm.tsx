"use client";

import { Button } from "@/src/ui/Button";
import { Dialog } from "@/src/ui/Dialog";

export type ConfirmProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
};

export function Confirm({ open, title, description, confirmLabel, tone = "primary", onConfirm, onCancel }: ConfirmProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Batal
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
