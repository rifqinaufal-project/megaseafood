"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { useAuth } from "@/src/presentation/auth/use-auth";
import { confirmDiscardChanges } from "@/src/presentation/dashboard/unsaved-changes";

export default function AccountMenu() {
  const { snapshot, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
        return;
      }
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (snapshot.status !== "authenticated") return null;
  const { username } = snapshot;

  return (
    <div className="account-menu" ref={root}>
      <button
        className="profile-pill"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu akun ${username}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="avatar">{username.slice(0, 2).toUpperCase()}</span>
        <span className="profile-meta">
          <strong>{username}</strong>
          <small>Akun aktif</small>
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          <div className="account-dropdown-head">
            <small>Masuk sebagai</small>
            <strong>{username}</strong>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (!confirmDiscardChanges()) return;
              setOpen(false);
              logout();
            }}
          >
            <LogOut size={15} /> Keluar
          </button>
        </div>
      )}
    </div>
  );
}
