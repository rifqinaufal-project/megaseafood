"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastTone = "success" | "error" | "info";

type Toast = { id: number; message: string; tone: ToastTone };
type ToastContextValue = { notify: (message: string, tone?: ToastTone) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const lastId = useRef(0);

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    lastId.current += 1;
    const id = lastId.current;
    setToast({ id, message, tone });
    window.setTimeout(
      () => setToast((current) => (current?.id === id ? null : current)),
      tone === "error" ? 7000 : 2800,
    );
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          role={toast.tone === "error" ? "alert" : "status"}
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-surface px-4 py-2 text-sm text-text shadow-sm"
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast dipakai di luar ToastProvider");
  return value;
}
