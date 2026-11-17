"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Download, Plus, ReceiptText, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import type { Module } from "@/src/domain/dashboard";
import type { BusinessState, Invoice, InvoiceDirectCost, Receipt } from "@/src/domain/business-state";
import { today } from "@/src/domain/business-state";
import {
  effectiveInvoiceStatus,
  invoiceCostTotal,
  invoiceDirectCostTotal,
  invoiceScaleMargin,
  invoiceStatusLabel,
  invoiceTransactionProfit,
} from "@/src/domain/invoice";
import { directCostLabel } from "@/src/domain/settings";
import {
  buildRestoReport,
  reportPeriods,
  supplierBillStatus,
  supplierPayableSummary,
  type DailyPoint,
  type ReportPeriod,
  type SupplierBillStatus,
} from "@/src/domain/resto-reports";
import { Cell, Tabs, downloadCsv, money, type Notify } from "@/src/presentation/dashboard/resto-ui";

const percent = (value: number) => `${value.toFixed(1).replace(".", ",")}%`;
const compact = (value: number) => {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1).replace(".", ",")}jt`;
  if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3)}rb`;
  return `${sign}${Math.round(abs)}`;
};
const dayLabel = (date: string) => date.slice(8, 10);

function PeriodSwitcher({ value, onChange }: { value: ReportPeriod; onChange: (value: ReportPeriod) => void }) {
  return (
    <div className="period-switcher" role="tablist" aria-label="Pilih periode laporan">
      {reportPeriods.map((item) => (
        <button key={item.value} type="button" role="tab" aria-selected={value === item.value} className={value === item.value ? "active" : ""} onClick={() => onChange(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

function Metric({
  title,
  value,
  icon,
  change,
  changeLabel,
  tone,
  internal,
  onClick,
}: {
  title: string;
  value: string;
  icon?: ReactNode;
  change?: number | null;
  changeLabel?: string;
  tone?: "warn" | "danger";
  internal?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="metric-head">
        <span>
          {title}
          {internal && <em className="internal-tag">Internal</em>}
        </span>
        {icon && <i className="metric-icon">{icon}</i>}
      </div>
      <strong className={tone ? `stat-${tone}` : undefined}>{value}</strong>
      {change !== undefined && change !== null && (
        <small className={`metric-change ${change > 0 ? "up" : change < 0 ? "down" : ""}`}>
          {change > 0 ? <TrendingUp size={13} /> : change < 0 ? <TrendingDown size={13} /> : null}
          {change > 0 ? "+" : ""}
          {percent(change)} {changeLabel}
        </small>
      )}
    </>
  );
  return onClick ? (
    <button type="button" className="resource-stat metric-card is-link" onClick={onClick}>{body}</button>
  ) : (
    <div className="resource-stat metric-card">{body}</div>
  );
}

function SalesChart({ data, label }: { data: DailyPoint[]; label: string }) {
  const max = Math.max(1, ...data.map((item) => item.revenue));
  return (
    <section className="panel chart-card">
      <p className="chart-kicker">Penjualan Harian</p>
      <h2 className="chart-title">{label}</h2>
      {data.length === 0 ? (
        <div className="empty-state">Belum ada penjualan pada periode ini.</div>
      ) : (
        <div className="mini-bars" role="img" aria-label="Grafik penjualan harian" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
          {data.map((item) => (
            <div key={item.date} className="mini-bar" title={`${item.date}: ${money(item.revenue)} · ${item.orders} order`}>
              <span className="mini-bar-value">{compact(item.revenue)}</span>
              <i style={{ height: `${Math.max(4, (item.revenue / max) * 100)}%` }} />
              <small>{dayLabel(item.date)}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ProfitChart({ data, label }: { data: DailyPoint[]; label: string }) {
  const width = 520;
  const height = 170;
  const pad = 14;
  const profits = data.map((item) => item.profit);
  const low = Math.min(0, ...profits);
  const high = Math.max(1, ...profits);
  const span = high - low || 1;
  const x = (index: number) => (data.length === 1 ? width / 2 : pad + (index / (data.length - 1)) * (width - pad * 2));
  const y = (value: number) => height - pad - ((value - low) / span) * (height - pad * 2);
  const points = data.map((item, index) => `${x(index)},${y(item.profit)}`).join(" ");
  const margins = data.map((item) => (item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0));
  const marginLow = Math.min(0, ...margins);
  const marginSpan = (Math.max(1, ...margins) - marginLow) || 1;
  const marginPoints = margins.map((value, index) => `${x(index)},${height - pad - ((value - marginLow) / marginSpan) * (height - pad * 2)}`).join(" ");
  return (
    <section className="panel chart-card">
      <p className="chart-kicker">Laba Bersih &amp; Margin</p>
      <h2 className="chart-title">{label}</h2>
      {data.length === 0 ? (
        <div className="empty-state">Belum ada data laba pada periode ini.</div>
      ) : (
        <>
          <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafik laba bersih dan margin" preserveAspectRatio="none">
            <line x1={pad} x2={width - pad} y1={y(0)} y2={y(0)} className="line-zero" />
            {data.length > 1 && <polyline points={marginPoints} className="line-margin" fill="none" />}
            {data.length > 1 && <polyline points={points} className="line-profit" fill="none" />}
            {data.map((item, index) => (
              <circle key={item.date} cx={x(index)} cy={y(item.profit)} r={4} className="line-dot">
                <title>{`${item.date}: laba ${money(item.profit)} · margin ${percent(margins[index])}`}</title>
              </circle>
            ))}
          </svg>
          <div className="line-axis">
            <span>{data[0].date.slice(5)}</span>
            <span>{data.at(-1)!.date.slice(5)}</span>
          </div>
          <div className="chart-legend">
            <span><i className="legend-dark" /> Laba bersih</span>
            <span><i className="legend-amber" /> Margin</span>
          </div>
        </>
      )}
    </section>
  );
}

function Row({ label, value, tone, internal, strong }: { label: string; value: string; tone?: string; internal?: boolean; strong?: boolean }) {
  return (
    <div className="summary-row">
      <span>
        {label}
        {internal && <em className="internal-tag">Int</em>}
      </span>
      <b className={`${tone ?? ""}${strong ? " strong" : ""}`.trim() || undefined}>{value}</b>
    </div>
  );
}

type Navigate = (module: Module, page: string, openForm?: boolean, invoiceId?: string) => void;

export function RestoDashboardPage({ business, onNavigate }: { business: BusinessState; onNavigate: Navigate }) {
  const [period, setPeriod] = useState<ReportPeriod>("30d");
  const asOf = today();
  const report = useMemo(() => buildRestoReport(business, period, asOf), [business, period, asOf]);
  const m = report.metrics;
  const outstanding = report.invoices
    .filter((item) => item.outstandingAmount > 0)
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const overdue = outstanding.filter((item) => effectiveInvoiceStatus(item, asOf) === "OVERDUE");
  const lowStock = business.products.filter((item) => item.status === "ACTIVE" && item.stockBalance <= item.minimumStock);
  const costTotal = report.expenseByCategory.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="workspace-page resto-dashboard">
      <div className="workspace-page-head">
        <div>
          <p className="eyebrow">Resto &amp; Online / Dashboard</p>
          <h1>Ringkasan bisnis</h1>
          <p>Pantau order, arus pendapatan, dan kewajiban dalam {report.label.toLowerCase()}.</p>
        </div>
        <div className="workspace-actions">
          <PeriodSwitcher value={period} onChange={setPeriod} />
          <button className="secondary-outline-button" type="button" onClick={() => onNavigate("resto", "Laporan")}>Lihat laporan</button>
          <button className="primary-button" type="button" onClick={() => onNavigate("resto", "Invoice", true)}>
            <Plus size={16} /> Buat invoice
          </button>
        </div>
      </div>
      <p className="period-caption">Periode {report.label.toLowerCase()} · acuan data {report.anchor}</p>

      <div className="resource-stats metric-grid">
        <Metric title="Order dalam periode" value={String(m.orders)} icon={<ReceiptText size={16} />} change={m.ordersChange} changeLabel="vs periode sebelumnya" onClick={() => onNavigate("resto", "Invoice")} />
        <Metric title="Pendapatan periode" value={money(m.revenue)} icon={<TrendingUp size={16} />} change={m.revenueChange} changeLabel="vs periode sebelumnya" onClick={() => onNavigate("resto", "Laporan")} />
        <Metric title="Piutang berjalan" value={money(m.receivables)} icon={<AlertTriangle size={16} />} tone={m.receivables > 0 ? "warn" : undefined} onClick={() => onNavigate("resto", "Pembayaran")} />
        <Metric title="Laba Bersih" value={money(m.netProfit)} icon={<TrendingUp size={16} />} change={m.netMargin} changeLabel="margin" internal tone={m.netProfit < 0 ? "danger" : undefined} />
        <Metric title="Nilai persediaan" value={money(m.inventoryValue)} icon={<Wallet size={16} />} internal onClick={() => onNavigate("resto", "Stok")} />
        <Metric title="Margin bersih" value={percent(m.netMargin)} icon={<TrendingUp size={16} />} internal />
      </div>

      <div className="two-col">
        <SalesChart data={report.daily} label={report.label} />
        <ProfitChart data={report.daily} label={report.label} />
      </div>

      <div className="three-col">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="chart-kicker">Biaya Operasional <em className="internal-tag">Internal</em></p>
              <h2 className="chart-title">{money(costTotal)}</h2>
            </div>
            <button className="text-link" type="button" onClick={() => onNavigate("resto", "Pengeluaran")}>Lihat pengeluaran →</button>
          </div>
          {report.expenseByCategory.length === 0 ? (
            <div className="empty-state">Belum ada pengeluaran pada periode ini.</div>
          ) : (
            <div className="cost-list">
              {report.expenseByCategory.map((item) => (
                <div key={item.category}>
                  <div><span>{item.category}</span><b>{money(item.amount)}</b></div>
                  <div className="cost-bar-track"><i style={{ width: `${costTotal > 0 ? (item.amount / costTotal) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <p className="chart-kicker">Status Piutang</p>
          <div className="summary-list">
            <Row label="Total piutang" value={money(m.receivables)} />
            <Row label="Jatuh tempo" value={`${m.overdueCount} invoice`} tone={m.overdueCount > 0 ? "text-danger" : undefined} />
          </div>
          {overdue.length > 0 && (
            <div className="summary-list summary-divided">
              {overdue.slice(0, 2).map((item) => (
                <Row key={item.id} label={item.customerName} value={money(item.outstandingAmount)} tone="text-danger" />
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <p className="chart-kicker">Ringkasan Keuangan</p>
          <div className="summary-list">
            <Row label="Pendapatan" value={money(m.revenue)} />
            <Row label="HPP Produk" value={money(m.hpp)} internal />
            <Row label="Biaya Internal" value={money(m.directCosts)} internal />
            <Row label="Pengeluaran Operasional" value={money(m.operatingExpenses)} internal />
            <Row label="Laba Bersih" value={money(m.netProfit)} internal strong />
            <Row label="Margin" value={percent(m.netMargin)} internal strong />
          </div>
        </section>
      </div>

      <div className="two-col">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="chart-kicker">Invoice Belum Lunas</p>
              <h2 className="chart-title">{money(m.receivables)}</h2>
              {m.overdueCount > 0 && <small className="text-danger">{m.overdueCount} invoice jatuh tempo</small>}
            </div>
            <button className="text-link" type="button" onClick={() => onNavigate("resto", "Invoice")}>Lihat semua →</button>
          </div>
          {outstanding.length === 0 ? (
            <div className="empty-state">Semua invoice sudah lunas.</div>
          ) : (
            <div className="batch-item-list">
              {outstanding.slice(0, 5).map((item) => {
                const status = effectiveInvoiceStatus(item, asOf);
                return (
                  <div className="batch-item" key={item.id}>
                    <div>
                      <button className="text-link" type="button" onClick={() => onNavigate("resto", "Invoice", false, item.id)}>{item.customerName}</button>
                      <small>{item.invoiceNumber} · Jatuh tempo {item.dueDate || "—"}</small>
                    </div>
                    <div className="batch-item-end">
                      <b>{money(item.outstandingAmount)}</b>
                      <span className={`status status-${status === "OVERDUE" ? "danger" : status === "PARTIALLY_PAID" ? "tercatat" : "berjalan"}`}>
                        {status === "OVERDUE" ? "Jatuh tempo" : invoiceStatusLabel(status)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="chart-kicker">Perlu perhatian</p>
              <h2 className="chart-title">Stok menipis</h2>
            </div>
            <button className="text-link" type="button" onClick={() => onNavigate("resto", "Stok")}>Buka stok →</button>
          </div>
          {lowStock.length === 0 ? (
            <div className="empty-state">Semua stok berada di atas minimum.</div>
          ) : (
            <div className="stock-items resto-stock-list">
              {lowStock.slice(0, 5).map((item) => (
                <div key={item.id}>
                  <span>{item.name}</span>
                  <b>{item.stockBalance} {item.unit} / min. {item.minimumStock} {item.unit}</b>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ───────────────────────── Laporan ─────────────────────────

type ReportTab = "sales" | "profit" | "internal" | "receivables" | "payables";
type SortState = { key: string; dir: "asc" | "desc" };

function useSort(initial: SortState) {
  const [sort, setSort] = useState<SortState>(initial);
  const toggle = (key: string) =>
    setSort((current) => (current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  return { sort, toggle };
}

function compareValues(a: string | number, b: string | number, dir: "asc" | "desc") {
  const result = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
  return dir === "asc" ? result : -result;
}

function SortTable({
  columns,
  sort,
  onSort,
  empty,
  count,
  children,
}: {
  columns: { key?: string; label: string; right?: boolean }[];
  sort: SortState;
  onSort: (key: string) => void;
  empty: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table className="resto-table report-table">
        <thead>
          <tr>
            {columns.map((column) => {
              const active = column.key === sort.key;
              const Icon = active ? (sort.dir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
              return (
                <th key={column.label} className={column.right ? "num" : undefined} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {column.key ? (
                    <button type="button" className="sort-button" onClick={() => onSort(column.key!)}>
                      {column.label}
                      <Icon size={12} className={active ? "on" : ""} />
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {count === 0 && <div className="empty-state">{empty}</div>}
    </div>
  );
}

const billTone: Record<SupplierBillStatus, { label: string; tone: string }> = {
  OPEN: { label: "Belum lunas", tone: "diproses" },
  OVERDUE: { label: "Jatuh tempo", tone: "danger" },
  PAID: { label: "Lunas", tone: "lunas" },
  VERIFY: { label: "Perlu verifikasi", tone: "tercatat" },
  CANCELLED: { label: "Dibatalkan", tone: "nonaktif" },
};

export function RestoReportsPage({ business, onNotify, onNavigate }: { business: BusinessState; onNotify: Notify; onNavigate: Navigate }) {
  const [tab, setTab] = useState<ReportTab>("sales");
  const [period, setPeriod] = useState<ReportPeriod>("30d");
  const asOf = today();
  const report = useMemo(() => buildRestoReport(business, period, asOf), [business, period, asOf]);
  const m = report.metrics;
  const customerName = (invoice: Invoice) => invoice.customerName;
  const supplierName = (receipt: Receipt) => business.suppliers.find((item) => item.id === receipt.supplierId)?.name ?? "Supplier dihapus";

  const salesSort = useSort({ key: "date", dir: "desc" });
  const receivableSort = useSort({ key: "due", dir: "asc" });
  const payableSort = useSort({ key: "due", dir: "asc" });
  const profitSort = useSort({ key: "date", dir: "desc" });
  const internalSort = useSort({ key: "date", dir: "desc" });

  const sales = [...report.invoices].sort((a, b) => {
    const pick: Record<string, (item: Invoice) => string | number> = {
      number: (item) => item.invoiceNumber,
      customer: customerName,
      date: (item) => item.date,
      revenue: (item) => item.total,
      hpp: invoiceCostTotal,
      direct: invoiceDirectCostTotal,
      profit: invoiceTransactionProfit,
      margin: (item) => (item.total > 0 ? invoiceTransactionProfit(item) / item.total : 0),
    };
    const get = pick[salesSort.sort.key] ?? pick.date;
    return compareValues(get(a), get(b), salesSort.sort.dir);
  });
  const profits = [...report.invoices].sort((a, b) => {
    const pick: Record<string, (item: Invoice) => string | number> = {
      number: (item) => item.invoiceNumber,
      customer: customerName,
      date: (item) => item.date,
      profit: (item) => invoiceTransactionProfit(item) - invoiceScaleMargin(item),
      scale: invoiceScaleMargin,
      paid: (item) => item.paidAmount,
      total: invoiceTransactionProfit,
    };
    const get = pick[profitSort.sort.key] ?? pick.date;
    return compareValues(get(a), get(b), profitSort.sort.dir);
  });
  type CostLine = { invoice: Invoice; cost: InvoiceDirectCost };
  const costLines: CostLine[] = report.invoices
    .flatMap((invoice) => (invoice.directCosts ?? []).map((cost) => ({ invoice, cost })))
    .sort((a, b) => {
      const pick: Record<string, (item: CostLine) => string | number> = {
        number: (item) => item.invoice.invoiceNumber,
        customer: (item) => item.invoice.customerName,
        date: (item) => item.invoice.date,
        category: (item) => directCostLabel(item.cost.category),
        name: (item) => item.cost.name,
        amount: (item) => item.cost.amount,
      };
      const get = pick[internalSort.sort.key] ?? pick.date;
      return compareValues(get(a), get(b), internalSort.sort.dir);
    });
  const unpaid = report.invoices
    .filter((item) => item.outstandingAmount > 0)
    .sort((a, b) => {
      const pick: Record<string, (item: Invoice) => string | number> = {
        number: (item) => item.invoiceNumber,
        customer: customerName,
        date: (item) => item.date,
        due: (item) => item.dueDate || "9999-12-31",
        total: (item) => item.total,
        paid: (item) => item.paidAmount,
        remaining: (item) => item.outstandingAmount,
        status: (item) => effectiveInvoiceStatus(item, asOf),
      };
      const get = pick[receivableSort.sort.key] ?? pick.due;
      return compareValues(get(a), get(b), receivableSort.sort.dir);
    });
  const bills = report.receipts
    .filter((item) => item.status === "POSTED")
    .sort((a, b) => {
      const pick: Record<string, (item: Receipt) => string | number> = {
        number: (item) => item.receiptNumber,
        supplier: supplierName,
        due: (item) => item.dueDate || "9999-12-31",
        total: (item) => item.subtotal,
        remaining: (item) => Math.max(0, item.subtotal - (item.paidAmount ?? 0)),
        status: (item) => supplierBillStatus(item, asOf),
      };
      const get = pick[payableSort.sort.key] ?? pick.due;
      return compareValues(get(a), get(b), payableSort.sort.dir);
    });
  const payables = supplierPayableSummary(report.receipts, asOf);

  const exportCurrent = () => {
    if (tab === "sales") {
      downloadCsv("laporan-penjualan", ["Nomor", "Restoran", "Tanggal", "Pendapatan", "HPP", "Biaya Internal", "Laba", "Margin"], sales.map((item) => [item.invoiceNumber, item.customerName, item.date, item.total, invoiceCostTotal(item), invoiceDirectCostTotal(item), invoiceTransactionProfit(item), item.total > 0 ? Number(((invoiceTransactionProfit(item) / item.total) * 100).toFixed(2)) : 0]));
    } else if (tab === "profit") {
      downloadCsv("laporan-laba", ["Invoice", "Restoran", "Tanggal", "Laba", "Tonjolan bobot", "Sudah dibayar", "Total"], profits.map((item) => [item.invoiceNumber, item.customerName, item.date, invoiceTransactionProfit(item) - invoiceScaleMargin(item), invoiceScaleMargin(item), item.paidAmount, invoiceTransactionProfit(item)]));
    } else if (tab === "internal") {
      downloadCsv("laporan-biaya-internal", ["Invoice", "Restoran", "Tanggal", "Kategori", "Keterangan", "Nominal"], costLines.map(({ invoice, cost }) => [invoice.invoiceNumber, invoice.customerName, invoice.date, directCostLabel(cost.category), cost.name, cost.amount]));
    } else if (tab === "receivables") {
      downloadCsv("laporan-piutang", ["Nomor", "Restoran", "Tanggal", "Jatuh tempo", "Total", "Dibayar", "Sisa"], unpaid.map((item) => [item.invoiceNumber, item.customerName, item.date, item.dueDate, item.total, item.paidAmount, item.outstandingAmount]));
    } else {
      downloadCsv("laporan-utang-supplier", ["Penerimaan", "Supplier", "Tanggal", "Jatuh tempo", "Total", "Sisa"], bills.map((item) => [item.receiptNumber, supplierName(item), item.date, item.dueDate, item.subtotal, item.paidAmount === undefined ? "" : item.subtotal - item.paidAmount]));
    }
    onNotify("Laporan berhasil diexport");
  };

  const titles: Record<ReportTab, { title: string; description: string }> = {
    sales: { title: "Laporan Penjualan", description: "Analisis penjualan per periode" },
    profit: { title: "Laporan Laba", description: "Omzet dikurangi HPP dan pengeluaran operasional" },
    internal: { title: "Biaya Internal", description: "Rincian biaya langsung per invoice" },
    receivables: { title: "Piutang", description: "Daftar invoice yang belum lunas" },
    payables: { title: "Hutang Supplier", description: "Tagihan penerimaan stok yang harus diselesaikan ke supplier" },
  };

  return (
    <div className="workspace-page resto-reports">
      <div className="workspace-page-head">
        <div>
          <p className="eyebrow">Resto &amp; Online / Laporan</p>
          <h1>{titles[tab].title}</h1>
          <p>{titles[tab].description} · {report.label}</p>
        </div>
        <div className="workspace-actions">
          <PeriodSwitcher value={period} onChange={setPeriod} />
          <button className="secondary-outline-button" type="button" onClick={exportCurrent}><Download size={14} /> Export</button>
        </div>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "sales", label: "Penjualan" },
          { value: "profit", label: "Laba" },
          { value: "internal", label: "Biaya Internal" },
          { value: "receivables", label: "Piutang" },
          { value: "payables", label: "Hutang Supplier" },
        ]}
      />

      {tab === "sales" && (
        <>
          <div className="resource-stats metric-grid metric-grid-4">
            <Metric title="Total Pendapatan" value={money(m.revenue)} />
            <Metric title="Total Invoice" value={`${m.orders} invoice`} />
            <Metric title="Laba Transaksi" value={money(m.transactionProfit)} internal />
            <Metric title="Modal" value={money(m.hpp + m.inventoryValue)} internal />
          </div>
          <SalesChart data={report.daily} label={report.label} />
          <section className="panel">
            <h2 className="panel-title">Daftar Invoice Penjualan</h2>
            <SortTable
              sort={salesSort.sort}
              onSort={salesSort.toggle}
              count={sales.length}
              empty="Belum ada invoice penjualan pada periode ini."
              columns={[{ key: "number", label: "Nomor" }, { key: "customer", label: "Restoran" }, { key: "date", label: "Tanggal" }, { key: "revenue", label: "Pendapatan", right: true }, { key: "hpp", label: "HPP", right: true }, { key: "direct", label: "Biaya", right: true }, { key: "profit", label: "Laba", right: true }, { key: "margin", label: "Margin", right: true }]}
            >
              {sales.map((item) => {
                const profit = invoiceTransactionProfit(item);
                return (
                  <tr key={item.id}>
                    <Cell label="Nomor" className="resource-primary-cell"><button className="text-link" type="button" onClick={() => onNavigate("resto", "Invoice", false, item.id)}>{item.invoiceNumber}</button></Cell>
                    <Cell label="Restoran">{item.customerName}</Cell>
                    <Cell label="Tanggal" className="nowrap">{item.date}</Cell>
                    <Cell label="Pendapatan" className="num nowrap">{money(item.total)}</Cell>
                    <Cell label="HPP" className="num nowrap">{money(invoiceCostTotal(item))}</Cell>
                    <Cell label="Biaya" className="num nowrap">{money(invoiceDirectCostTotal(item))}</Cell>
                    <Cell label="Laba" className="num nowrap"><span className="text-success">{money(profit)}</span></Cell>
                    <Cell label="Margin" className="num nowrap">{percent(item.total > 0 ? (profit / item.total) * 100 : 0)}</Cell>
                  </tr>
                );
              })}
            </SortTable>
          </section>
        </>
      )}

      {tab === "profit" && (
        <>
          <div className="resource-stats metric-grid metric-grid-5">
            <Metric title="Omzet" value={money(m.revenue)} />
            <Metric title="HPP Produk" value={money(m.hpp)} internal />
            <Metric title="Laba Kotor" value={money(m.grossProfit)} internal />
            <Metric title="Biaya Internal" value={money(m.directCosts)} internal />
            <Metric title="Pengeluaran" value={money(m.operatingExpenses)} internal />
          </div>
          <div className="two-col">
            {[
              { title: "Laba Bersih · Sudah Dibayar", note: "Estimasi laba dari pembayaran yang sudah tercatat", total: m.paidProfit - m.operatingExpenses, scale: m.paidScaleMargin },
              { title: "Laba Bersih · Invoice Terbit", note: "Potensi laba dari seluruh invoice yang diterbitkan", total: m.netProfit, scale: m.scaleMargin },
            ].map((card) => (
              <section className="panel profit-card" key={card.title}>
                <p className="chart-kicker">{card.title} <em className="internal-tag">Internal</em></p>
                <small>{card.note}</small>
                <div className="profit-card-grid">
                  <div><span>Laba</span><b>{money(card.total - card.scale)}</b></div>
                  <div><span>Tonjolan Bobot</span><b>{money(card.scale)}</b></div>
                  <div><span>Total</span><b className="strong">{money(card.total)}</b></div>
                </div>
              </section>
            ))}
          </div>
          <div className="two-col">
            <ProfitChart data={report.daily} label={report.label} />
            <section className="panel">
              <p className="chart-kicker">Pengeluaran Operasional <em className="internal-tag">Internal</em></p>
              <h2 className="chart-title">{money(m.operatingExpenses)}</h2>
              {report.expenseByCategory.length === 0 ? (
                <div className="empty-state">Belum ada pengeluaran pada periode ini.</div>
              ) : (
                <div className="cost-list">
                  {report.expenseByCategory.map((item) => (
                    <div key={item.category}>
                      <div><span>{item.category}</span><b>{money(item.amount)}</b></div>
                      <div className="cost-bar-track"><i style={{ width: `${m.operatingExpenses > 0 ? (item.amount / m.operatingExpenses) * 100 : 0}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          <section className="panel">
            <h2 className="panel-title">Ringkasan Laba</h2>
            <div className="summary-grid">
              <Row label="Omzet" value={money(m.revenue)} />
              <Row label="HPP Produk" value={money(m.hpp)} internal />
              <Row label="Laba Produk" value={money(m.grossProfit)} internal />
              <Row label="Biaya Internal" value={money(m.directCosts)} internal />
              <Row label="Laba Transaksi" value={money(m.transactionProfit)} internal />
              <Row label="Laba Transaksi · Sudah Dibayar" value={money(m.paidProfit)} internal />
              <Row label="Pengeluaran Operasional" value={money(m.operatingExpenses)} internal />
              <Row label="Laba Bersih" value={money(m.netProfit)} internal strong />
              <Row label="Laba Bersih · Sudah Dibayar" value={money(m.paidProfit - m.operatingExpenses)} internal strong />
              <Row label="Margin Bersih" value={percent(m.netMargin)} internal strong />
            </div>
          </section>
          <section className="panel">
            <h2 className="panel-title">Rincian laba per invoice</h2>
            <p className="invoice-hint">Laba dipisahkan dari tambahan margin timbangan pada periode ini.</p>
            <SortTable
              sort={profitSort.sort}
              onSort={profitSort.toggle}
              count={profits.length}
              empty="Belum ada invoice pada periode ini."
              columns={[{ key: "number", label: "Invoice" }, { key: "customer", label: "Restoran" }, { key: "date", label: "Tanggal" }, { key: "profit", label: "Laba", right: true }, { key: "scale", label: "Tonjolan Bobot", right: true }, { key: "paid", label: "Sudah Dibayar", right: true }, { key: "total", label: "Total", right: true }]}
            >
              {profits.map((item) => {
                const scale = invoiceScaleMargin(item);
                const profit = item.total - invoiceCostTotal(item);
                return (
                  <tr key={item.id}>
                    <Cell label="Invoice" className="resource-primary-cell"><button className="text-link" type="button" onClick={() => onNavigate("resto", "Invoice", false, item.id)}>{item.invoiceNumber}</button></Cell>
                    <Cell label="Restoran">{item.customerName}</Cell>
                    <Cell label="Tanggal" className="nowrap">{item.date}</Cell>
                    <Cell label="Laba" className="num nowrap"><span className="text-success">{money(profit - scale)}</span></Cell>
                    <Cell label="Tonjolan Bobot" className="num nowrap">{money(scale)}</Cell>
                    <Cell label="Sudah Dibayar" className="num nowrap">{money(item.paidAmount)}</Cell>
                    <Cell label="Total" className="num nowrap"><strong>{money(profit)}</strong></Cell>
                  </tr>
                );
              })}
            </SortTable>
          </section>
        </>
      )}

      {tab === "internal" && (
        <>
          <div className="resource-stats metric-grid metric-grid-4">
            <Metric title="Total Biaya Internal" value={money(m.directCosts)} internal />
            <Metric title="Jumlah Biaya" value={`${costLines.length} item`} />
            <Metric title="Kategori Terbesar" value={report.directCostByCategory[0] ? directCostLabel(report.directCostByCategory[0].category) : "—"} internal />
            <Metric title="% dari Pendapatan" value={percent(m.revenue > 0 ? (m.directCosts / m.revenue) * 100 : 0)} internal />
          </div>
          <div className="two-col">
            <section className="panel">
              <p className="chart-kicker">Biaya per kategori <em className="internal-tag">Internal</em></p>
              <h2 className="chart-title">{money(m.directCosts)}</h2>
              {report.directCostByCategory.length === 0 ? (
                <div className="empty-state">Belum ada biaya internal pada periode ini.</div>
              ) : (
                <div className="cost-list">
                  {report.directCostByCategory.map((item) => (
                    <div key={item.category}>
                      <div><span>{directCostLabel(item.category)}</span><b>{money(item.amount)}</b></div>
                      <div className="cost-bar-track"><i style={{ width: `${m.directCosts > 0 ? (item.amount / m.directCosts) * 100 : 0}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="panel">
              <p className="chart-kicker">Breakdown kategori</p>
              {report.directCostByCategory.length === 0 ? (
                <div className="empty-state">Tambahkan biaya internal saat membuat atau mengedit invoice.</div>
              ) : (
                <div className="summary-list">
                  {report.directCostByCategory.map((item) => (
                    <Row key={item.category} label={directCostLabel(item.category)} value={`${money(item.amount)} · ${percent(m.directCosts > 0 ? (item.amount / m.directCosts) * 100 : 0)}`} />
                  ))}
                </div>
              )}
            </section>
          </div>
          <section className="panel">
            <h2 className="panel-title">Rincian biaya per invoice</h2>
            <SortTable
              sort={internalSort.sort}
              onSort={internalSort.toggle}
              count={costLines.length}
              empty="Belum ada biaya internal pada periode ini."
              columns={[{ key: "number", label: "Invoice" }, { key: "customer", label: "Restoran" }, { key: "date", label: "Tanggal" }, { key: "category", label: "Kategori" }, { key: "name", label: "Keterangan" }, { key: "amount", label: "Nominal", right: true }]}
            >
              {costLines.map(({ invoice, cost }) => (
                <tr key={`${invoice.id}-${cost.id}`}>
                  <Cell label="Invoice" className="resource-primary-cell"><button className="text-link" type="button" onClick={() => onNavigate("resto", "Invoice", false, invoice.id)}>{invoice.invoiceNumber}</button></Cell>
                  <Cell label="Restoran">{invoice.customerName}</Cell>
                  <Cell label="Tanggal" className="nowrap">{invoice.date}</Cell>
                  <Cell label="Kategori" className="nowrap">{directCostLabel(cost.category)}</Cell>
                  <Cell label="Keterangan">{cost.name}</Cell>
                  <Cell label="Nominal" className="num nowrap">{money(cost.amount)}</Cell>
                </tr>
              ))}
            </SortTable>
            <div className="report-foot">
              <span>{costLines.length} biaya pada {report.invoices.filter((item) => (item.directCosts ?? []).length > 0).length} invoice</span>
              <b>Total: {money(m.directCosts)}</b>
            </div>
          </section>
        </>
      )}

      {tab === "receivables" && (
        <>
          <div className="resource-stats">
            <Metric title="Total Piutang" value={money(m.receivables)} icon={<AlertTriangle size={16} />} tone={m.receivables > 0 ? "warn" : undefined} />
            <Metric title="Invoice Overdue" value={`${m.overdueCount} invoice`} tone={m.overdueCount > 0 ? "danger" : undefined} />
            <Metric title="Nilai Overdue" value={money(m.overdueAmount)} tone={m.overdueAmount > 0 ? "danger" : undefined} />
          </div>
          <section className="panel">
            <SortTable
              sort={receivableSort.sort}
              onSort={receivableSort.toggle}
              count={unpaid.length}
              empty="Tidak ada piutang outstanding. Semua invoice telah lunas!"
              columns={[{ key: "number", label: "Nomor Invoice" }, { key: "customer", label: "Restoran" }, { key: "date", label: "Tanggal" }, { key: "due", label: "Jatuh Tempo" }, { key: "total", label: "Total", right: true }, { key: "paid", label: "Dibayar", right: true }, { key: "remaining", label: "Sisa", right: true }, { key: "status", label: "Status" }]}
            >
              {unpaid.map((item) => {
                const status = effectiveInvoiceStatus(item, asOf);
                return (
                  <tr key={item.id}>
                    <Cell label="Nomor Invoice" className="resource-primary-cell"><button className="text-link" type="button" onClick={() => onNavigate("resto", "Invoice", false, item.id)}>{item.invoiceNumber}</button></Cell>
                    <Cell label="Restoran">{item.customerName}</Cell>
                    <Cell label="Tanggal" className="nowrap">{item.date}</Cell>
                    <Cell label="Jatuh Tempo" className="nowrap"><span className={status === "OVERDUE" ? "text-danger" : undefined}>{item.dueDate || "—"}</span></Cell>
                    <Cell label="Total" className="num nowrap">{money(item.total)}</Cell>
                    <Cell label="Dibayar" className="num nowrap">{item.paidAmount > 0 ? <span className="text-success">{money(item.paidAmount)}</span> : "—"}</Cell>
                    <Cell label="Sisa" className="num nowrap"><strong className={status === "OVERDUE" ? "text-danger" : undefined}>{money(item.outstandingAmount)}</strong></Cell>
                    <Cell label="Status" className="nowrap"><span className={`status status-${status === "OVERDUE" ? "danger" : status === "PARTIALLY_PAID" ? "tercatat" : "berjalan"}`}>{status === "OVERDUE" ? "Jatuh tempo" : invoiceStatusLabel(status)}</span></Cell>
                  </tr>
                );
              })}
            </SortTable>
            <div className="report-foot">
              <span>{unpaid.length} invoice belum lunas</span>
              <b>Total: {money(m.receivables)}</b>
            </div>
          </section>
        </>
      )}

      {tab === "payables" && (
        <>
          <div className="resource-stats">
            <Metric title="Total Hutang" value={money(payables.total)} icon={<Wallet size={16} />} tone={payables.total > 0 ? "danger" : undefined} />
            <Metric title="Tagihan Jatuh Tempo" value={`${payables.overdueCount} tagihan`} tone={payables.overdueCount > 0 ? "warn" : undefined} />
            <Metric title="Nilai Jatuh Tempo" value={money(payables.overdueAmount)} tone={payables.overdueAmount > 0 ? "danger" : undefined} />
          </div>
          {payables.unverifiedCount > 0 && (
            <p className="invoice-hint">{payables.unverifiedCount} penerimaan lama belum diketahui status pembayarannya dan tidak dihitung sebagai hutang. Verifikasi di halaman Utang.</p>
          )}
          <section className="panel">
            <div className="resto-toolbar resource-toolbar">
              <h2 className="panel-title">Tagihan supplier</h2>
              <button className="secondary-outline-button compact" type="button" onClick={() => onNavigate("resto", "Utang")}>Kelola di halaman Utang</button>
            </div>
            <SortTable
              sort={payableSort.sort}
              onSort={payableSort.toggle}
              count={bills.length}
              empty="Belum ada hutang supplier pada periode ini."
              columns={[{ key: "number", label: "Tagihan" }, { key: "supplier", label: "Supplier" }, { key: "due", label: "Jatuh Tempo" }, { key: "total", label: "Total", right: true }, { key: "remaining", label: "Sisa", right: true }, { key: "status", label: "Status" }]}
            >
              {bills.map((item) => {
                const status = supplierBillStatus(item, asOf);
                const remaining = item.paidAmount === undefined ? null : Math.max(0, item.subtotal - item.paidAmount);
                return (
                  <tr key={item.id}>
                    <Cell label="Tagihan" className="resource-primary-cell"><strong>{item.receiptNumber}</strong>{item.supplierReference && <small className="cell-sub">Ref: {item.supplierReference}</small>}</Cell>
                    <Cell label="Supplier">{supplierName(item)}<small className="cell-sub">{item.date}</small></Cell>
                    <Cell label="Jatuh Tempo" className="nowrap"><span className={status === "OVERDUE" ? "text-danger" : undefined}>{item.dueDate || "—"}</span></Cell>
                    <Cell label="Total" className="num nowrap">{money(item.subtotal)}</Cell>
                    <Cell label="Sisa" className="num nowrap">{remaining === null ? "Belum diketahui" : <strong className={remaining > 0 ? "text-danger" : undefined}>{money(remaining)}</strong>}</Cell>
                    <Cell label="Status" className="nowrap"><span className={`status status-${billTone[status].tone}`}>{billTone[status].label}</span></Cell>
                  </tr>
                );
              })}
            </SortTable>
          </section>
        </>
      )}
    </div>
  );
}
