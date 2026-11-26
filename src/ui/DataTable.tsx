import type { KeyboardEvent, ReactNode } from "react";
import { cx } from "@/src/ui/cx";

export type DataColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Disembunyikan di tampilan kartu (layar kecil), misalnya kolom nomor urut. */
  hideOnMobile?: boolean;
};

export type DataTableProps<T> = {
  caption: string;
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Ditampilkan saat `rows` kosong. */
  empty: ReactNode;
  /** Baris total. Nilai dicocokkan ke kolom lewat `key`. Label tampil di kolom pertama. */
  footer?: { label: string; values: Partial<Record<string, ReactNode>> };
  className?: string;
};

/** Tabel di layar md ke atas, daftar kartu di layar kecil. Keduanya dirender, dan CSS memilih salah satu. */
export function DataTable<T>({ caption, columns, rows, rowKey, onRowClick, empty, footer, className }: DataTableProps<T>) {
  const shell = "overflow-hidden rounded-3xl border border-border bg-surface";

  if (rows.length === 0) return <div className={cx(shell, className)}>{empty}</div>;

  const rowClass = onRowClick
    ? "cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    : "";

  const interaction = (row: T) => {
    if (!onRowClick) return {};
    return {
      tabIndex: 0,
      onClick: () => onRowClick(row),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onRowClick(row);
      },
    };
  };

  const footerMobile = footer ? columns.filter((column) => !column.hideOnMobile && footer.values[column.key] !== undefined) : [];

  return (
    <div className={cx(shell, className)}>
      <table className="hidden w-full md:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cx("px-5 py-3 text-xs font-medium text-text-muted", column.align === "right" ? "text-right" : "text-left")}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} {...interaction(row)} className={cx("border-b border-border text-sm last:border-b-0", rowClass)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cx("px-5 py-3.5 tabular-nums", column.align === "right" ? "text-right" : "text-left")}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="bg-surface-2 text-sm font-semibold">
              {columns.map((column, index) => (
                <td
                  key={column.key}
                  className={cx("px-5 py-3 tabular-nums", column.align === "right" ? "text-right" : "text-left")}
                >
                  {index === 0 ? footer.label : footer.values[column.key]}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>

      <ul className="flex flex-col divide-y divide-border md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} {...interaction(row)} className={cx("p-4", rowClass)}>
            <dl className="flex flex-col gap-1.5 text-sm">
              {columns
                .filter((column) => !column.hideOnMobile)
                .map((column) => (
                  <div key={column.key} className="flex items-baseline justify-between gap-4">
                    <dt className="text-text-muted">{column.header}</dt>
                    <dd className="min-w-0 text-right tabular-nums">{column.render(row)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
        {footer && (
          <li className="flex flex-col gap-1.5 bg-surface-2 p-4 text-sm font-semibold">
            <p>{footer.label}</p>
            {footerMobile.map((column) => (
              <div key={column.key} className="flex justify-between gap-4">
                <span className="font-normal text-text-muted">{column.header}</span>
                <span className="tabular-nums">{footer.values[column.key]}</span>
              </div>
            ))}
          </li>
        )}
      </ul>
    </div>
  );
}
