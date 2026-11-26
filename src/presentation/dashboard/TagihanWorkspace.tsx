"use client";

import { useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  formatRupiah,
  today,
  type BusinessState,
  type LapakSale,
} from "@/src/domain/business-state";
import type { BusinessCommands } from "@/src/application/use-cases/business-commands";
import {
  groupByMonth,
  inRange as inPeriodRange,
  monthKey,
  monthLabel,
  periodRange,
  type LapakPeriod,
} from "@/src/domain/lapak-periods";
import LapakPeriodControl from "@/src/presentation/dashboard/LapakPeriodControl";
import WorkspaceHeader from "@/src/presentation/dashboard/components/WorkspaceHeader";

type Notify = (message: string, tone?: "success" | "error" | "info") => void;

type Props = {
  business: BusinessState;
  commands: BusinessCommands;
  onNotify: Notify;
  initialFormOpen?: boolean;
  initialPeriod?: LapakPeriod;
};

const PAGE_SIZE = 25;
const portalReady =
  typeof document !== "undefined" ? createPortal !== undefined : false;
const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

export function formatLedgerDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || "");
  if (!match) return value || "—";
  return `${Number(match[3])} ${monthNames[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

const money = (value: number) => `Rp ${formatRupiah(value)}`;

type LedgerLine = {
  row: LapakSale;
  restan: number;
};

export type LedgerGroup = {
  customerName: string;
  lines: LedgerLine[];
  credit: number;
  debit: number;
  restan: number;
  lastDate: string;
};

/**
 * Groups the flat ledger into one block per customer, ordered oldest first, and
 * walks the running balance so every line shows the restan after that transaction.
 */
export function buildLedgerGroups(rows: LapakSale[]): LedgerGroup[] {
  const byCustomer = new Map<string, LapakSale[]>();
  for (const row of rows) {
    const name = row.customerName.trim() || "—";
    byCustomer.set(name, [...(byCustomer.get(name) ?? []), row]);
  }
  return [...byCustomer.entries()]
    .map(([customerName, entries]) => {
      const sorted = [...entries].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          // On the same day a credit came before the payment it caused.
          (a.kind === b.kind ? 0 : a.kind === "KREDIT" ? -1 : 1) ||
          a.createdAt.localeCompare(b.createdAt),
      );
      let restan = 0;
      const lines = sorted.map((row) => {
        restan += row.kind === "KREDIT" ? row.amount : -row.amount;
        return { row, restan };
      });
      return {
        customerName,
        lines,
        credit: sorted
          .filter((row) => row.kind === "KREDIT")
          .reduce((sum, row) => sum + row.amount, 0),
        debit: sorted
          .filter((row) => row.kind === "DEBIT")
          .reduce((sum, row) => sum + row.amount, 0),
        restan,
        lastDate: sorted[sorted.length - 1]?.date ?? "",
      };
    })
    .sort((a, b) => a.customerName.localeCompare(b.customerName, "id"));
}

export const ledgerTotals = (groups: LedgerGroup[]) => ({
  customers: groups.length,
  credit: groups.reduce((sum, group) => sum + group.credit, 0),
  debit: groups.reduce((sum, group) => sum + group.debit, 0),
  restan: groups.reduce((sum, group) => sum + group.restan, 0),
});

type EditorRow = {
  key: number;
  date: string;
  kind: "KREDIT" | "DEBIT";
  amount: string;
  note: string;
};

export default function TagihanWorkspace({
  business,
  commands,
  onNotify,
  initialFormOpen = false,
  initialPeriod = "Harian",
}: Props) {
  const [formOpen, setFormOpen] = useState(initialFormOpen);
  const [editing, setEditing] = useState<LapakSale | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"ALL" | "KREDIT" | "DEBIT">("ALL");
  const [sort, setSort] = useState<"nama" | "tanggal" | "nominal">("nama");
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<LapakPeriod>(initialPeriod);
  const [anchor, setAnchor] = useState(today());
  const range = useMemo(() => periodRange(period, anchor), [period, anchor]);

  const groups = useMemo(
    () => buildLedgerGroups(business.lapakSales),
    [business.lapakSales],
  );
  /**
   * Filters only narrow which transaction rows are visible. The running restan of a visible row
   * still grows from the customer's full history, so a filtered row never shows a sliced balance,
   * and the customer header keeps showing the real current restan.
   */
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const visible = groups
      .map((group) => ({
        ...group,
        lines: group.lines.filter(
          (line) =>
            (kind === "ALL" || line.row.kind === kind) &&
            inPeriodRange(line.row.date, range),
        ),
      }))
      .filter((group) => group.lines.length > 0)
      .filter(
        (group) => !term || group.customerName.toLowerCase().includes(term),
      )
      .map((group) => ({
        ...group,
        lastDate: group.lines.at(-1)?.row.date ?? "",
      }));
    if (sort === "tanggal")
      return [...visible].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
    if (sort === "nominal")
      return [...visible].sort((a, b) => b.restan - a.restan);
    return visible;
  }, [groups, search, kind, sort, range]);

  /**
   * Buku Tagihan is read per month, like the spreadsheet it replaces. A card belongs to the month of
   * its latest visible transaction, so a customer with transactions in two months appears in both,
   * and its running restan still reflects the whole history.
   */
  const monthGroups = useMemo(
    () =>
      groupByMonth(
        filtered,
        (group) => group.lines.at(-1)?.row.date ?? "",
        (group) => group.restan,
      ).map((month) => ({
        ...month,
        credit: month.items.reduce((sum, group) => sum + group.credit, 0),
        debit: month.items.reduce((sum, group) => sum + group.debit, 0),
        transactions: month.items.reduce(
          (sum, group) => sum + group.lines.length,
          0,
        ),
      })),
    [filtered],
  );

  // Summary cards describe what is on screen: the selected period, or the whole book on "Semua".
  const totals = useMemo(() => {
    if (!range) return ledgerTotals(groups);
    const scoped = groups
      .map((group) => {
        const lines = group.lines.filter((line) =>
          inPeriodRange(line.row.date, range),
        );
        return {
          ...group,
          lines,
          credit: lines
            .filter((line) => line.row.kind === "KREDIT")
            .reduce((sum, line) => sum + line.row.amount, 0),
          debit: lines
            .filter((line) => line.row.kind === "DEBIT")
            .reduce((sum, line) => sum + line.row.amount, 0),
        };
      })
      .filter((group) => group.lines.length > 0);
    return {
      customers: scoped.length,
      credit: scoped.reduce((sum, group) => sum + group.credit, 0),
      debit: scoped.reduce((sum, group) => sum + group.debit, 0),
      // Restan is the customer's real balance, it never shrinks just because a period is picked.
      restan: ledgerTotals(groups).restan,
    };
  }, [groups, range]);
  const pageCount = Math.max(1, Math.ceil(monthGroups.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageMonths = monthGroups.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const filtersActive =
    period !== initialPeriod ||
    anchor !== today() ||
    kind !== "ALL" ||
    !!search.trim();

  const exportCsv = () => {
    const rows: string[][] = [
      [
        "No",
        "Bulan",
        "Nama Pelanggan",
        "Tanggal",
        "Kredit",
        "Debit",
        "Restan",
        "Keterangan",
      ],
    ];
    let index = 0;
    for (const group of filtered)
      for (const line of group.lines) {
        index += 1;
        rows.push([
          String(index),
          monthLabel(monthKey(line.row.date)),
          group.customerName,
          line.row.date,
          line.row.kind === "KREDIT" ? String(line.row.amount) : "",
          line.row.kind === "DEBIT" ? String(line.row.amount) : "",
          String(line.restan),
          line.row.note,
        ]);
      }
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = "buku-tagihan.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    onNotify(`${index} baris buku tagihan berhasil diexport`);
  };

  const remove = (row: LapakSale) => {
    if (
      !window.confirm(
        `Hapus transaksi ${row.kind === "KREDIT" ? "kredit" : "debit"} ${row.customerName} sebesar ${money(row.amount)}? Restan pelanggan akan dihitung ulang.`,
      )
    )
      return;
    const result = commands.deleteLapakSale(row.id);
    onNotify(result.message, result.ok ? "success" : "error");
  };

  return (
    <div className="workspace-page ledger-page">
      <WorkspaceHeader
        eyebrow="Home / Buku Tagihan"
        title="Buku Tagihan"
        description="Kelola transaksi kredit, debit, dan sisa tagihan pelanggan."
        actions={
          <>
            <button
              className="secondary-outline-button"
              type="button"
              onClick={exportCsv}
            >
              <Download size={15} /> Export
            </button>
            <button
              className="secondary-outline-button"
              type="button"
              onClick={() => window.print()}
            >
              <Printer size={15} /> Cetak
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus size={16} /> Tambah Transaksi
            </button>
          </>
        }
      />

      <div className="resource-stats resource-stats-4 ledger-stats">
        {[
          {
            title: "Total Pelanggan",
            value: totals.customers.toLocaleString("id-ID"),
            detail: range
              ? "pelanggan pada periode ini"
              : "pelanggan dengan catatan tagihan",
            icon: <Users size={16} />,
            tone: "",
          },
          {
            title: "Total Kredit",
            value: money(totals.credit),
            detail: range
              ? "kredit pada periode ini"
              : "akumulasi seluruh tagihan",
            icon: <ArrowUpRight size={16} />,
            tone: "is-credit",
          },
          {
            title: "Total Debit",
            value: money(totals.debit),
            detail: range
              ? "pembayaran pada periode ini"
              : "akumulasi seluruh pembayaran",
            icon: <ArrowDownLeft size={16} />,
            tone: "is-debit",
          },
          {
            title: "Total Restan",
            value: money(totals.restan),
            detail: range
              ? "saldo aktual, semua periode"
              : "kredit dikurangi debit",
            icon: <Wallet size={16} />,
            tone: totals.restan > 0 ? "is-open" : "is-settled",
          },
        ].map((card) => (
          <div
            className="resource-stat metric-card ledger-stat"
            key={card.title}
          >
            <div className="metric-head">
              <span>{card.title}</span>
              <i className={`metric-icon${card.tone ? ` ${card.tone}` : ""}`}>
                {card.icon}
              </i>
            </div>
            <strong className={card.tone || undefined}>{card.value}</strong>
            <small>{card.detail}</small>
          </div>
        ))}
      </div>

      <div className="lapak-period-toolbar">
        <LapakPeriodControl
          period={period}
          anchor={anchor}
          onPeriod={(next) => {
            setPeriod(next);
            setPage(1);
          }}
          onAnchor={(next) => {
            setAnchor(next);
            setPage(1);
          }}
          variant="bar"
          allCaption="Dikelompokkan per bulan, lalu per pelanggan"
        />
      </div>

      <section className="panel resource-panel ledger-panel">
        <div className="resource-toolbar ledger-toolbar">
          <label className="table-search">
            <Search size={16} />
            <input
              placeholder="Cari nama pelanggan..."
              aria-label="Cari pelanggan"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="ledger-filter">
            <span>Jenis</span>
            <select
              value={kind}
              aria-label="Filter jenis transaksi"
              onChange={(event) => {
                setKind(event.target.value as typeof kind);
                setPage(1);
              }}
            >
              <option value="ALL">Semua</option>
              <option value="KREDIT">Kredit</option>
              <option value="DEBIT">Debit</option>
            </select>
          </label>
          <label className="ledger-filter">
            <span>Urutkan</span>
            <select
              value={sort}
              aria-label="Urutkan"
              onChange={(event) => setSort(event.target.value as typeof sort)}
            >
              <option value="nama">Nama</option>
              <option value="tanggal">Periode terbaru</option>
              <option value="nominal">Restan terbesar</option>
            </select>
          </label>
          {filtersActive && (
            <button
              className="text-link ledger-reset"
              type="button"
              onClick={() => {
                setSearch("");
                setKind("ALL");
                setPeriod(initialPeriod);
                setAnchor(today());
                setPage(1);
              }}
            >
              Reset filter
            </button>
          )}
        </div>

        {pageMonths.length ? (
          <div className="ledger-groups">
            {pageMonths.map((month) => (
              <section
                className="lapak-month"
                key={month.key || "no-date"}
                aria-label={`Buku tagihan ${month.label}`}
              >
                <header className="lapak-month-head">
                  <div>
                    <h2>{month.label}</h2>
                    <small>
                      {month.items.length} pelanggan · {month.transactions}{" "}
                      transaksi
                    </small>
                  </div>
                  <div className="lapak-month-figures">
                    <span>
                      <small>Total transaksi</small>
                      <b>{money(month.credit + month.debit)}</b>
                    </span>
                  </div>
                </header>
                <div className="ledger-groups">
                  {month.items.map((group) => {
                          const cardKey = `${month.key}-${group.customerName}`;
                          const open = expanded === cardKey;
                          return (
                            <section
                              className={`panel ledger-card${open ? " is-open" : ""}`}
                              key={`${month.key}-${group.customerName}`}
                            >
                              <header className="ledger-card-head">
                                <div className="ledger-customer">
                                  <span
                                    className="ledger-avatar"
                                    aria-hidden="true"
                                  >
                                    {initials(group.customerName)}
                                  </span>
                                  <div>
                                    <h3>{group.customerName}</h3>
                                    <p>
                                      {group.lines.length} transaksi · terakhir{" "}
                                      {formatLedgerDate(group.lastDate)}
                                    </p>
                                  </div>
                                </div>
                                <div
                                  className="ledger-customer-figures"
                                  aria-label={`Saldo ${group.customerName}`}
                                >
                                  {filtersActive && (
                                    <small className="ledger-figures-note">
                                      saldo semua transaksi
                                    </small>
                                  )}
                                  <span>
                                    <small>Kredit</small>
                                    <b className="is-credit">
                                      {money(group.credit)}
                                    </b>
                                  </span>
                                  <span>
                                    <small>Debit</small>
                                    <b className="is-debit">
                                      {money(group.debit)}
                                    </b>
                                  </span>
                                  <span>
                                    <small>Restan</small>
                                    <b
                                      className={
                                        group.restan > 0
                                          ? "is-open"
                                          : "is-settled"
                                      }
                                    >
                                      {money(group.restan)}
                                    </b>
                                  </span>
                                </div>
                                <button
                                  className="ledger-expand"
                                  type="button"
                                  aria-expanded={open}
                                  onClick={() =>
                                    setExpanded(open ? null : cardKey)
                                  }
                                >
                                  {open ? "Tutup" : "Riwayat"}{" "}
                                  <ChevronDown
                                    size={14}
                                    className={open ? "is-flipped" : ""}
                                  />
                                </button>
                              </header>

                              <div className="table-wrap ledger-table-wrap">
                                <table
                                  className="ledger-table"
                                  aria-label={`Buku tagihan ${group.customerName}`}
                                >
                                  <thead>
                                    <tr>
                                      <th className="ledger-no">No</th>
                                      <th>Nama Pelanggan</th>
                                      <th>Tanggal</th>
                                      <th className="ledger-amount">Kredit</th>
                                      <th className="ledger-amount">Debit</th>
                                      <th className="ledger-amount">Restan</th>
                                      <th className="ledger-actions-head">
                                        Aksi
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.lines.map((line, index) => (
                                      <tr
                                        key={line.row.id}
                                        className={
                                          line.row.kind === "DEBIT"
                                            ? "ledger-row-debit"
                                            : ""
                                        }
                                      >
                                        <td
                                          className="ledger-no"
                                          data-label="No"
                                        >
                                          {index + 1}
                                        </td>
                                        <td
                                          className="ledger-name"
                                          data-label="Nama Pelanggan"
                                        >
                                          <span
                                            className={`ledger-badge ledger-badge-${line.row.kind.toLowerCase()}`}
                                          >
                                            {line.row.kind === "KREDIT"
                                              ? "Kredit"
                                              : "Debit"}
                                          </span>
                                          {line.row.note && (
                                            <small>{line.row.note}</small>
                                          )}
                                        </td>
                                        <td
                                          className="ledger-date"
                                          data-label="Tanggal"
                                        >
                                          {formatLedgerDate(line.row.date)}
                                        </td>
                                        <td
                                          className="ledger-amount is-credit"
                                          data-label="Kredit"
                                        >
                                          {line.row.kind === "KREDIT"
                                            ? money(line.row.amount)
                                            : "—"}
                                        </td>
                                        <td
                                          className="ledger-amount is-debit"
                                          data-label="Debit"
                                        >
                                          {line.row.kind === "DEBIT"
                                            ? money(line.row.amount)
                                            : "—"}
                                        </td>
                                        <td
                                          className={`ledger-amount ${line.restan > 0 ? "is-open" : "is-settled"}`}
                                          data-label="Restan"
                                        >
                                          {money(line.restan)}
                                        </td>
                                        <td
                                          className="ledger-row-actions"
                                          data-label="Aksi"
                                        >
                                          <button
                                            className="ledger-icon-button"
                                            type="button"
                                            aria-label={`Edit transaksi ${group.customerName} ${formatLedgerDate(line.row.date)}`}
                                            onClick={() => {
                                              setEditing(line.row);
                                              setFormOpen(true);
                                            }}
                                          >
                                            <Pencil size={14} />
                                          </button>
                                          <button
                                            className="ledger-icon-button is-danger"
                                            type="button"
                                            aria-label={`Hapus transaksi ${group.customerName} ${formatLedgerDate(line.row.date)}`}
                                            onClick={() => remove(line.row)}
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              {open && (
                                <div className="ledger-detail">
                                  <p className="ledger-detail-note">
                                    Restan {money(group.restan)} terbentuk dari{" "}
                                    <b className="is-credit">
                                      {money(group.credit)}
                                    </b>{" "}
                                    kredit dikurangi{" "}
                                    <b className="is-debit">
                                      {money(group.debit)}
                                    </b>{" "}
                                    debit, dihitung berurutan sesuai tabel.
                                  </p>
                                  <ol className="ledger-history">
                                    {group.lines.map((line) => (
                                      <li key={line.row.id}>
                                        <span className="ledger-history-date">
                                          {formatLedgerDate(line.row.date)}
                                        </span>
                                        <span
                                          className={`ledger-badge ledger-badge-${line.row.kind.toLowerCase()}`}
                                        >
                                          {line.row.kind === "KREDIT"
                                            ? "Kredit"
                                            : "Debit"}
                                        </span>
                                        <span className="ledger-history-amount">
                                          {line.row.kind === "KREDIT"
                                            ? "+"
                                            : "−"}{" "}
                                          {money(line.row.amount)}
                                        </span>
                                        <span className="ledger-history-restan">
                                          Restan {money(line.restan)}
                                        </span>
                                        {line.row.note && (
                                          <small>{line.row.note}</small>
                                        )}
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              )}
                            </section>
                          );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="empty-state ledger-empty">
            <strong>
              {business.lapakSales.length === 0
                ? "Belum ada transaksi buku tagihan"
                : "Tidak ada transaksi yang cocok"}
            </strong>
            <p>
              {business.lapakSales.length === 0
                ? "Mulai dengan mencatat transaksi kredit pertama. Debit dicatat saat pelanggan membayar."
                : filtersActive
                  ? "Coba ubah kata kunci, jenis transaksi, atau rentang tanggal."
                  : "Tidak ada transaksi pada periode ini. Pilih periode lain atau pilih Semua."}
            </p>
          </div>
        )}

        {monthGroups.length > PAGE_SIZE && (
          <div className="ledger-pagination">
            <span>
              Menampilkan {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, monthGroups.length)} dari{" "}
              {monthGroups.length} bulan
            </span>
            <div>
              <button
                className="ledger-icon-button"
                type="button"
                aria-label="Halaman sebelumnya"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft size={15} />
              </button>
              <span>
                Halaman {currentPage} / {pageCount}
              </span>
              <button
                className="ledger-icon-button"
                type="button"
                aria-label="Halaman berikutnya"
                disabled={currentPage === pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </section>

      {formOpen && (
        <LedgerForm
          key={editing?.id ?? "new"}
          business={business}
          commands={commands}
          onNotify={onNotify}
          editing={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  return `${parts[0][0] ?? ""}${parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : ""}`.toUpperCase();
}

const emptyRow = (key: number, seed?: Partial<EditorRow>): EditorRow => ({
  key,
  date: today(),
  kind: "KREDIT",
  amount: "",
  note: "",
  ...seed,
});

function LedgerForm({
  business,
  commands,
  onNotify,
  editing,
  onClose,
}: {
  business: BusinessState;
  commands: BusinessCommands;
  onNotify: Notify;
  editing: LapakSale | null;
  onClose: () => void;
}) {
  const listId = useId();
  const nextKey = useRef(2);
  const [customerName, setCustomerName] = useState(editing?.customerName ?? "");
  const [rows, setRows] = useState<EditorRow[]>(() =>
    editing
      ? [
          emptyRow(1, {
            date: editing.date,
            kind: editing.kind,
            amount: formatRupiah(String(editing.amount)),
            note: editing.note,
          }),
        ]
      : [emptyRow(1)],
  );
  const customers = useMemo(
    () =>
      [
        ...new Set(
          business.lapakSales
            .map((row) => row.customerName.trim())
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, "id")),
    [business.lapakSales],
  );
  const numeric = (value: string) =>
    Number(value.replaceAll(".", "").replaceAll(/[^\d]/g, "")) || 0;
  const previewCredit = rows
    .filter((row) => row.kind === "KREDIT")
    .reduce((sum, row) => sum + numeric(row.amount), 0);
  const previewDebit = rows
    .filter((row) => row.kind === "DEBIT")
    .reduce((sum, row) => sum + numeric(row.amount), 0);
  const [error, setError] = useState("");

  const update = (key: number, patch: Partial<EditorRow>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  const submit = () => {
    if (!customerName.trim()) return setError("Nama pelanggan wajib diisi");
    for (const [index, row] of rows.entries()) {
      if (!row.date) return setError(`Baris ${index + 1}: tanggal wajib diisi`);
      if (numeric(row.amount) <= 0)
        return setError(
          `Baris ${index + 1}: nominal harus lebih besar dari nol`,
        );
    }
    setError("");
    if (editing) {
      const [row] = rows;
      const result = commands.updateLapakSale(editing.id, {
        date: row.date,
        customerName,
        kind: row.kind,
        amount: numeric(row.amount),
        note: row.note,
      });
      onNotify(result.message, result.ok ? "success" : "error");
      if (result.ok) onClose();
      return;
    }
    const result =
      rows.length === 1
        ? commands.addLapakSale({
            date: rows[0].date,
            customerName,
            kind: rows[0].kind,
            amount: numeric(rows[0].amount),
            note: rows[0].note,
          })
        : commands.addLapakSaleEntries({
            customerName,
            entries: rows.map((row) => ({
              date: row.date,
              kind: row.kind,
              amount: numeric(row.amount),
              note: row.note,
            })),
          });
    onNotify(result.message, result.ok ? "success" : "error");
    if (result.ok) onClose();
  };

  const modal = (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="form-modal ledger-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ledger-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">
              {editing ? "Edit transaksi" : "Buku tagihan"}
            </p>
            <h2 id="ledger-form-title">
              {editing ? "Edit Transaksi" : "Tambah Transaksi"}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Tutup"
            type="button"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="modal-copy">
          Pilih pelanggan satu kali, lalu tambahkan satu atau beberapa baris
          transaksi sekaligus.
        </p>

        <div className="ledger-form-grid">
          <label className="form-field">
            <span>Pelanggan *</span>
            <input
              list={listId}
              value={customerName}
              placeholder="Nama pelanggan"
              required
              onChange={(event) => setCustomerName(event.target.value)}
            />
            <datalist id={listId}>
              {customers.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="ledger-lines">
          <div className="ledger-line-head">
            <span>Tanggal</span>
            <span>Jenis</span>
            <span>Nominal</span>
            <span>Keterangan</span>
            <span />
          </div>
          {rows.map((row, index) => (
            <div className="ledger-line" key={row.key}>
              <label>
                <span>Tanggal</span>
                <input
                  type="date"
                  value={row.date}
                  required
                  onChange={(event) =>
                    update(row.key, { date: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Jenis</span>
                <select
                  value={row.kind}
                  onChange={(event) =>
                    update(row.key, {
                      kind: event.target.value as EditorRow["kind"],
                    })
                  }
                >
                  <option value="KREDIT">Kredit</option>
                  <option value="DEBIT">Debit</option>
                </select>
              </label>
              <label>
                <span>Nominal</span>
                <input
                  inputMode="numeric"
                  value={row.amount}
                  placeholder="0"
                  required
                  onChange={(event) =>
                    update(row.key, {
                      amount: formatRupiah(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                <span>Keterangan</span>
                <input
                  value={row.note}
                  placeholder="Opsional"
                  onChange={(event) =>
                    update(row.key, { note: event.target.value })
                  }
                />
              </label>
              <button
                className="ledger-icon-button is-danger"
                type="button"
                aria-label={`Hapus baris ${index + 1}`}
                disabled={rows.length === 1 || Boolean(editing)}
                onClick={() =>
                  setRows((current) =>
                    current.filter((item) => item.key !== row.key),
                  )
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {!editing && (
            <button
              className="secondary-outline-button ledger-add-line"
              type="button"
              onClick={() =>
                setRows((current) => [...current, emptyRow(nextKey.current++)])
              }
            >
              <Plus size={15} /> Tambah Baris
            </button>
          )}
        </div>

        <div className="ledger-preview">
          <span>
            Kredit <b className="is-credit">{money(previewCredit)}</b>
          </span>
          <span>
            Debit <b className="is-debit">{money(previewDebit)}</b>
          </span>
          <span>
            Restan transaksi{" "}
            <b
              className={
                previewCredit - previewDebit > 0 ? "is-open" : "is-settled"
              }
            >
              {money(previewCredit - previewDebit)}
            </b>
          </span>
        </div>

        {error && (
          <p className="ledger-form-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button
            className="secondary-outline-button"
            type="button"
            onClick={onClose}
          >
            Batal
          </button>
          <button className="primary-button" type="button" onClick={submit}>
            <Plus size={16} />{" "}
            {editing ? "Simpan Perubahan" : "Simpan Transaksi"}
          </button>
        </div>
      </div>
    </div>
  );
  return portalReady ? createPortal(modal, document.body) : modal;
}
