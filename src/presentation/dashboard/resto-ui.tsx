"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { formatRupiah } from "@/src/domain/business-state";
import type { CommandResult } from "@/src/application/use-cases/business-commands";

export type Notify = (message: string, tone?: "success" | "error" | "info") => void;

const subscribeToNothing = () => () => {};
const portalReadyOnClient = () => true;
const portalReadyOnServer = () => false;

export const money = (value: number) => `Rp ${formatRupiah(value)}`;
export const qty = (value: number) => Number(value.toFixed(3)).toLocaleString("id-ID");
export const parseMoney = (value: string) => Number(value.replace(/\D/g, "")) || 0;
export const parseNumber = (value: string) => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
export const report = (onNotify: Notify, result: CommandResult) => {
  onNotify(result.message, result.ok ? "success" : "error");
  return result.ok;
};

export function downloadCsv(filename: string, columns: string[], rows: (string | number)[][]) {
  const csv = [columns, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function Modal({
  title,
  eyebrow,
  description,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  const portalReady = useSyncExternalStore(subscribeToNothing, portalReadyOnClient, portalReadyOnServer);
  const modal = (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className={`form-modal${wide ? " form-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <button className="icon-button" aria-label="Tutup" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {description && <p className="modal-copy">{description}</p>}
        {children}
      </div>
    </div>
  );
  return portalReady ? createPortal(modal, document.body) : modal;
}

export function FormField({
  label,
  hint,
  span = false,
  children,
}: {
  label: string;
  hint?: string;
  span?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`form-field${span ? " span-2" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small className="form-hint">{hint}</small>}
    </label>
  );
}

export function MoneyInput({
  value,
  onChange,
  placeholder,
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <input
      inputMode="numeric"
      required={required}
      placeholder={placeholder}
      value={formatRupiah(value)}
      onChange={(event) => onChange(formatRupiah(event.target.value))}
    />
  );
}

export function ModalActions({ onCancel, submitLabel }: { onCancel: () => void; submitLabel: string }) {
  return (
    <div className="modal-actions">
      <button className="secondary-outline-button" type="button" onClick={onCancel}>
        Batal
      </button>
      <button className="primary-button" type="submit">
        {submitLabel}
      </button>
    </div>
  );
}

export function StatusChip({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

export function IconAction({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const showTooltip = (button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    const below = rect.top < 56;
    setTooltip({
      left: Math.max(12, Math.min(window.innerWidth - 12, rect.left + rect.width / 2)),
      top: below ? rect.bottom + 8 : rect.top - 8,
      below,
    });
  };
  return (
    <>
      <button
        className={`icon-button${danger ? " danger-button" : ""}`}
        type="button"
        aria-label={label}
        aria-describedby={tooltip ? tooltipId : undefined}
        onMouseEnter={(event) => showTooltip(event.currentTarget)}
        onMouseLeave={() => setTooltip(null)}
        onFocus={(event) => showTooltip(event.currentTarget)}
        onBlur={() => setTooltip(null)}
        onClick={onClick}
      >
        {children}
      </button>
      {tooltip && typeof document !== "undefined" && createPortal(
        <span id={tooltipId} role="tooltip" className={`icon-action-tooltip${tooltip.below ? " below" : ""}`} style={{ left: tooltip.left, top: tooltip.top }}>
          {label}
        </span>,
        document.body,
      )}
    </>
  );
}

export function Pager({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  const count = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="pager">
      <span>
        {from}–{to} dari {total}
      </span>
      <div>
        <button type="button" aria-label="Halaman sebelumnya" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={16} />
        </button>
        <span>
          {page}/{count}
        </span>
        <button type="button" aria-label="Halaman berikutnya" disabled={page >= count} onClick={() => onPage(page + 1)}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function PageHead({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="workspace-page-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="workspace-actions">{children}</div>
    </div>
  );
}

export function Stats({ items }: { items: { label: string; value: string; detail: string; tone?: "warn" | "danger" }[] }) {
  return (
    <div className={`resource-stats resource-stats-${items.length}`} aria-label="Ringkasan data">
      {items.map((item) => (
        <div className="resource-stat" key={item.label}>
          <span>{item.label}</span>
          <strong className={item.tone ? `stat-${item.tone}` : undefined}>{item.value}</strong>
          <small>{item.detail}</small>
        </div>
      ))}
    </div>
  );
}

export const PAGE_SIZE = 25;

export const matches = (query: string, ...values: (string | number | undefined)[]) =>
  values.join(" ").toLowerCase().includes(query.trim().toLowerCase());

export function paginate<T>(items: T[], page: number) {
  const count = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), count);
  return { current, rows: items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE) };
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="table-search">
      <Search size={16} />
      <input placeholder={placeholder} aria-label={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select className="toolbar-select" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (value: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div className="resto-tabs" role="tablist">
      {items.map((item) => (
        <button key={item.value} type="button" role="tab" aria-selected={item.value === value} className={item.value === value ? "active" : ""} onClick={() => onChange(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Table({ columns, empty, children, count, className = "" }: { columns: string[]; empty: string; children: ReactNode; count: number; className?: string }) {
  return (
    <div className="table-wrap">
      <table className={`resto-table ${className}`.trim()}>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {count === 0 && <div className="empty-state">{empty}</div>}
    </div>
  );
}

export const Cell = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
  <td data-label={label} className={className}>{children}</td>
);

export type ComboboxOption = { value: string; label: string; detail?: string; search?: string };

type ListPosition = { top?: number; bottom?: number; left: number; width: number; maxHeight: number };

export function Combobox({ value, onChange, options, placeholder = "Cari...", ariaLabel, invalid, disabled, required, emptyText = "Tidak ada yang cocok." }: {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  ariaLabel: string;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  emptyText?: string;
}) {
  const listId = useId();
  const portalReady = useSyncExternalStore(subscribeToNothing, portalReadyOnClient, portalReadyOnServer);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<ListPosition | null>(null);
  const open = query !== null && !disabled;
  const selected = options.find((option) => option.value === value);

  const matches = useMemo(() => {
    const terms = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return options;
    return options.filter((option) => {
      const haystack = `${option.label} ${option.detail ?? ""} ${option.search ?? ""}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [options, query]);

  const place = () => {
    const box = input.current?.getBoundingClientRect();
    if (!box) return;
    const below = window.innerHeight - box.bottom - 12;
    const above = box.top - 12;
    const flip = below < 180 && above > below;
    const maxHeight = Math.max(120, Math.min(280, flip ? above : below));
    const width = Math.min(Math.max(box.width, 300), window.innerWidth - 16);
    setPosition({ left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)), width, maxHeight, ...(flip ? { bottom: window.innerHeight - box.top + 6 } : { top: box.bottom + 6 }) });
  };

  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, matches.length]);

  const openList = () => {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    place();
  };
  const choose = (option: ComboboxOption) => {
    onChange(option.value);
    setQuery(null);
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (matches[active]) choose(matches[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setQuery(null);
    } else if (event.key === "Tab") {
      setQuery(null);
    }
  };

  return (
    <div className={`combobox${invalid ? " invalid" : ""}`}>
      <input
        ref={input}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={query ?? selected?.label ?? ""}
        onFocus={openList}
        onClick={() => !open && openList()}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          place();
        }}
        onBlur={() => setQuery(null)}
        onKeyDown={onKey}
      />
      <ChevronDown className="combobox-chevron" size={15} aria-hidden="true" />
      {required && <input className="combobox-proxy" tabIndex={-1} aria-hidden="true" required value={value} onChange={() => {}} />}
      {open && position && portalReady && createPortal(
        <ul id={listId} role="listbox" className="combobox-list" style={position} onMouseDown={(event) => event.preventDefault()}>
          {matches.length === 0 ? (
            <li className="combobox-empty">{emptyText}</li>
          ) : (
            matches.map((option, index) => (
              <li key={option.value} role="option" aria-selected={option.value === value} className={index === active ? "active" : ""} onMouseEnter={() => setActive(index)} onClick={() => choose(option)}>
                <span>{option.label}</span>
                {option.detail && <small>{option.detail}</small>}
                {option.value === value && <Check size={14} aria-hidden="true" />}
              </li>
            ))
          )}
        </ul>,
        document.body,
      )}
    </div>
  );
}
