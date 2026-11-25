"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Bell,
  Boxes,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  CreditCard,
  Database,
  FileText,
  Filter,
  LayoutDashboard,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  Store,
  Truck,
  WalletCards,
  X,
} from "lucide-react";
import type {
  DashboardSnapshot,
  Module,
  OverviewRange,
} from "@/src/domain/dashboard";
import {
  searchBusiness,
  type GlobalSearchResult,
} from "@/src/domain/global-search";
import { buildOverview } from "@/src/domain/overview";
import {
  formatRupiah,
  today,
  type BusinessState,
} from "@/src/domain/business-state";
import AccountMenu from "@/src/presentation/auth/AccountMenu";
import {
  groupByDay,
  groupByMonth,
  inRange,
  periodRange,
  type LapakPeriod,
} from "@/src/domain/lapak-periods";
import LapakPeriodControl from "@/src/presentation/dashboard/LapakPeriodControl";
import SummaryStats from "@/src/presentation/dashboard/components/SummaryStats";
import WorkspaceHeader from "@/src/presentation/dashboard/components/WorkspaceHeader";
import { useLocalBusiness } from "@/src/presentation/dashboard/use-local-business";
import WorkspacePage from "@/src/presentation/dashboard/WorkspacePage";
import { RestoDashboardPage } from "@/src/presentation/dashboard/RestoReports";
import { confirmDiscardChanges } from "@/src/presentation/dashboard/unsaved-changes";
import {
  moduleLabels,
  workspaceNavLabels,
} from "@/src/presentation/dashboard/workspace-navigation";
import {
  dashboardLocationFromPath,
  dashboardPathForTarget,
} from "@/src/presentation/dashboard/workspace-routing";

const navItems: Record<
  Module,
  { label: string; icon: typeof LayoutDashboard }[]
> = {
  overview: [
    { label: workspaceNavLabels.overview[0], icon: ClipboardList },
    { label: workspaceNavLabels.overview[1], icon: FileText },
  ],
  lapak: [
    { label: workspaceNavLabels.lapak[0], icon: LayoutDashboard },
    { label: workspaceNavLabels.lapak[1], icon: Boxes },
    { label: workspaceNavLabels.lapak[2], icon: ShoppingBag },
    { label: workspaceNavLabels.lapak[3], icon: WalletCards },
    { label: workspaceNavLabels.lapak[4], icon: Truck },
    { label: workspaceNavLabels.lapak[5], icon: CreditCard },
  ],
  resto: [
    { label: workspaceNavLabels.resto[0], icon: LayoutDashboard },
    { label: workspaceNavLabels.resto[1], icon: Database },
    { label: workspaceNavLabels.resto[2], icon: FileText },
    { label: workspaceNavLabels.resto[3], icon: CreditCard },
    { label: workspaceNavLabels.resto[4], icon: WalletCards },
    { label: workspaceNavLabels.resto[5], icon: CreditCard },
    { label: workspaceNavLabels.resto[6], icon: Store },
    { label: workspaceNavLabels.resto[7], icon: Truck },
    { label: workspaceNavLabels.resto[8], icon: FileText },
  ],
};

const moduleDescriptions: Record<Exclude<Module, "overview">, string> = {
  lapak: "Batch, penjualan, dan biaya",
  resto: "Stok, invoice, dan pembayaran",
};

function BrandPill() {
  return (
    <div className="brand-pill">
      <span className="brand-mark" aria-hidden="true">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <path d="M3 9c3-3 6 3 9 0s6 3 9 0" />
          <path d="M3 15c3-3 6 3 9 0s6 3 9 0" />
        </svg>
      </span>
      <strong>megaseafood</strong>
    </div>
  );
}

function StatCard({ stat }: { stat: DashboardSnapshot["stats"][number] }) {
  const iconByKey = {
    wallet: WalletCards,
    lapak: ShoppingBag,
    resto: Store,
    receivable: CreditCard,
  } as const;
  const Icon = iconByKey[stat.iconKey];
  return (
    <article className={`stat-card ${stat.tone}`}>
      <div className="stat-card-top">
        <span>{stat.label}</span>
        <span className="stat-icon">
          <Icon size={18} strokeWidth={1.8} />
        </span>
      </div>
      <strong>{stat.value}</strong>
      <div className="stat-foot">
        <span
          className={
            stat.tone === "warning" ? "neutral-change" : "positive-change"
          }
        >
          {stat.tone !== "warning" && <ArrowUpRight size={14} />}
          {stat.change}
        </span>
        <small>{stat.detail}</small>
      </div>
    </article>
  );
}

const money = (amount: number) => `Rp ${formatRupiah(amount)}`;

function LapakDashboard({
  business,
  period,
  onPeriodChange,
  onNavigate,
}: {
  business: BusinessState;
  period: LapakPeriod;
  onPeriodChange: (period: LapakPeriod) => void;
  onNavigate: NavigateTarget;
}) {
  const dates = [
    ...business.batches.map((item) => item.startDate),
    ...business.commissions.map((item) => item.date),
    ...business.sourcings.map((item) => item.date),
    ...business.lapakSales.map((item) => item.date),
    ...business.lapakExpenses.map((item) => item.date),
  ];
  const anchor = dates.sort().at(-1) ?? today();
  // Same period rules as the Lapak pages: Harian = one day, Mingguan = Senin–Minggu, Bulanan = one month.
  const range = periodRange(period, anchor);
  const inPeriod = (date: string) => inRange(date, range);
  const commissions = business.commissions.filter((item) =>
    inPeriod(item.date),
  );
  const sourcings = business.sourcings.filter((item) => inPeriod(item.date));
  const sales = business.lapakSales.filter((item) => inPeriod(item.date));
  const expenses = business.lapakExpenses.filter((item) => inPeriod(item.date));
  const commissionTotal = commissions.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const salesTotal = sales.reduce(
    (sum, item) => sum + (item.kind === "KREDIT" ? item.amount : 0),
    0,
  );
  const sourcingTotal = sourcings.reduce((sum, item) => sum + item.total, 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + item.amount, 0);
  const batchIds = [
    ...new Set(
      // Sales are standalone, so only commission and expense records mark a batch as used.
      [...commissions, ...expenses].map((item) => item.batchId),
    ),
  ];
  const batchGroups = groupByMonth(
    batchIds
      .map((batchId) => business.batches.find((batch) => batch.id === batchId))
      .filter((batch): batch is BusinessState["batches"][number] =>
        Boolean(batch),
      ),
    (batch) => batch.startDate,
    (batch) =>
      commissions
        .filter((item) => item.batchId === batch.id)
        .reduce((sum, item) => sum + item.amount, 0),
  ).map((month) => ({
    ...month,
    days: groupByDay(month.items, (batch) => batch.startDate),
  }));
  return (
    <div className="workspace-page lapak-dashboard">
      <WorkspaceHeader
        eyebrow="Lapak / Dashboard"
        title="Dashboard Lapak"
        description="Ringkasan komisi, penjualan, pengadaan, dan biaya berdasarkan periode."
      />
      <SummaryStats
        stats={[
          {
            label: "Pendapatan",
            value: `Rp ${formatRupiah(commissionTotal + salesTotal)}`,
            detail: `${commissions.length + sales.length} transaksi`,
          },
          {
            label: "Total biaya",
            value: `Rp ${formatRupiah(expenseTotal)}`,
            detail: `${expenses.length} pengeluaran`,
          },
          {
            label: "Profit kotor",
            value: `Rp ${formatRupiah(commissionTotal + salesTotal - expenseTotal)}`,
            detail: `${batchIds.length} batch terlibat`,
          },
          {
            label: "Pengadaan & Bengkelan",
            value: `Rp ${formatRupiah(sourcingTotal)}`,
            detail: `${sourcings.length} catatan · terpisah dari profit`,
          },
        ]}
      />
      <div className="lapak-period-toolbar">
        <LapakPeriodControl
          period={period}
          anchor={anchor}
          onPeriod={onPeriodChange}
          onAnchor={() => undefined}
          showAnchor={false}
          variant="bar"
        />
      </div>
      <section className="panel resource-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Ringkasan per batch</p>
            <h2>Batch Lapak</h2>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => onNavigate("lapak", "Batch", true)}
          >
            <Plus size={16} /> Buat batch
          </button>
        </div>
        <div className="batch-dashboard-list">
          {batchGroups.length ? (
            batchGroups.map((month) => (
              <section
                className="dashboard-batch-month"
                key={month.key || "no-date"}
              >
                <header className="lapak-month-head">
                  <div>
                    <h3>{month.label}</h3>
                    <small>{month.items.length} batch</small>
                  </div>
                </header>
                {month.days.map((day) => (
                  <div
                    className="dashboard-batch-day"
                    key={day.key || "no-date"}
                  >
                    <div className="lapak-day-divider">
                      <strong>{day.label}</strong>
                      <span>{day.items.length} batch</span>
                    </div>
                    {day.items.map((batch) => {
                      const batchId = batch.id;
                      const batchCommission = commissions
                        .filter((item) => item.batchId === batchId)
                        .reduce((sum, item) => sum + item.amount, 0);
                      const batchCosts = expenses
                        .filter((item) => item.batchId === batchId)
                        .reduce((sum, item) => sum + item.amount, 0);
                      return (
                        <button
                          className="batch-dashboard-row"
                          type="button"
                          key={batchId}
                          onClick={() =>
                            onNavigate(
                              "lapak",
                              "Batch",
                              false,
                              undefined,
                              batchId,
                            )
                          }
                        >
                          <span>
                            <strong>
                              {batch?.batchNumber ?? "Batch tidak ditemukan"}
                            </strong>
                            <small>{batch?.notes || "Tanpa catatan"}</small>
                          </span>
                          <span>
                            <small>Pendapatan</small>
                            <b>Rp {formatRupiah(batchCommission)}</b>
                          </span>
                          <span>
                            <small>Biaya</small>
                            <b>Rp {formatRupiah(batchCosts)}</b>
                          </span>
                          <span className="status status-tercatat">Batch</span>
                          <ChevronRight size={17} />
                        </button>
                      );
                    })}
                  </div>
                ))}
              </section>
            ))
          ) : (
            <div className="empty-state">
              Belum ada transaksi pada periode ini.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ProfitChart({ dashboard }: { dashboard: DashboardSnapshot }) {
  const { chart } = dashboard;
  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Performance</p>
          <h2>Profit &amp; biaya</h2>
        </div>
        <button className="select-button" type="button">
          <span>6 bulan terakhir</span>
          <ChevronDown size={15} />
        </button>
      </div>
      <div className="chart-summary">
        <strong>{chart.total}</strong>
        {chart.change && (
          <span className="positive-change">
            <ArrowUpRight size={14} /> {chart.change}
          </span>
        )}
        <small>
          {chart.change ? "vs. bulan sebelumnya" : "profit 6 bulan terakhir"}
        </small>
      </div>
      <div className="chart-legend">
        <span>
          <i className="legend-profit" />
          Profit
        </span>
        <span>
          <i className="legend-cost" />
          Biaya
        </span>
      </div>
      <div
        className="bar-chart"
        role="img"
        aria-label="Grafik profit dan biaya 6 bulan terakhir"
      >
        {chart.labels.map((month, index) => (
          <div className="bar-group" key={month}>
            <div className="bars">
              <span
                className="bar profit-bar"
                style={{ height: `${chart.profit[index]}%` }}
              />
              <span
                className="bar cost-bar"
                style={{ height: `${chart.cost[index]}%` }}
              />
            </div>
            <small>{month}</small>
          </div>
        ))}
      </div>
      {!chart.hasData && (
        <p className="chart-empty">Belum ada transaksi untuk ditampilkan.</p>
      )}
    </section>
  );
}

function WalletsPanel({ dashboard }: { dashboard: DashboardSnapshot }) {
  return (
    <section className="panel wallets-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Cash position</p>
          <h2>Ringkasan kas</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Menu ringkasan kas"
          type="button"
        >
          <MoreHorizontal size={19} />
        </button>
      </div>
      <div className="cash-total">
        <span>Total kas aktif</span>
        <strong>{dashboard.cashTotal}</strong>
        <small>{dashboard.cashNote}</small>
      </div>
      <div className="wallet-list">
        {dashboard.wallets.map((wallet) => (
          <div className="wallet-row" key={wallet.name}>
            <span className={`wallet-dot ${wallet.tone}`} />
            <div>
              <strong>{wallet.name}</strong>
              <small>{wallet.description}</small>
            </div>
            <b>{wallet.amount}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActivityTable({
  query,
  onQueryChange,
  dashboard,
  onNavigate,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  dashboard: DashboardSnapshot;
  onNavigate: NavigateTarget;
}) {
  const filteredRows = dashboard.activities.filter((row) =>
    `${row.id} ${row.activity} ${row.status} ${row.amount} ${row.date}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="panel activity-panel">
      <div className="panel-heading activity-heading">
        <div>
          <p className="eyebrow">Latest records</p>
          <h2>Aktivitas terbaru</h2>
        </div>
        <button
          className="text-link"
          type="button"
          onClick={() => onNavigate("overview", "Aktivitas")}
        >
          Lihat semua <ChevronRight size={15} />
        </button>
      </div>
      <div className="table-toolbar">
        <label className="table-search">
          <Search size={16} />
          <input
            aria-label="Cari aktivitas"
            placeholder="Cari aktivitas..."
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <button className="filter-button" type="button">
          <Filter size={15} /> Filter <ChevronDown size={14} />
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Aktivitas</th>
              <th>Nilai</th>
              <th>Status</th>
              <th>Waktu</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id + row.date}>
                <td>
                  <span className="record-id">{row.id}</span>
                </td>
                <td>
                  <strong>{row.activity}</strong>
                </td>
                <td className="amount-cell">{row.amount}</td>
                <td>
                  <span
                    className={`status status-${row.status.toLowerCase().replaceAll(" ", "-")}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="date-cell">{row.date}</td>
                <td>
                  <button
                    className="row-more"
                    aria-label={`Opsi ${row.id}`}
                    type="button"
                    onClick={() =>
                      onNavigate(
                        row.activity.toLowerCase().includes("batch")
                          ? "lapak"
                          : "resto",
                        row.activity.toLowerCase().includes("batch")
                          ? "Batch"
                          : "Invoice",
                      )
                    }
                  >
                    <MoreHorizontal size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRows.length === 0 && (
          <div className="empty-state">
            {query ? "Tidak ada aktivitas yang cocok." : "Belum ada aktivitas."}
          </div>
        )}
      </div>
    </section>
  );
}

function OverviewWorkspaceCards({
  business,
  onNavigate,
}: {
  business: BusinessState;
  onNavigate: NavigateTarget;
}) {
  const lapakRevenue =
    business.commissions.reduce((sum, item) => sum + item.amount, 0) +
    business.lapakSales.reduce(
      (sum, item) => sum + (item.kind === "KREDIT" ? item.amount : 0),
      0,
    );
  const restoRevenue = business.invoices.reduce(
    (sum, invoice) => sum + invoice.total,
    0,
  );
  const outstandingInvoices = business.invoices.filter(
    (invoice) => invoice.outstandingAmount > 0,
  ).length;

  return (
    <section
      className="overview-workspaces"
      aria-labelledby="workspace-entry-title"
    >
      <div className="overview-section-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2 id="workspace-entry-title">Masuk ke area kerja</h2>
        </div>
        <span className="overview-section-note">
          Pilih module untuk melihat detail operasional
        </span>
      </div>
      <div className="workspace-entry-grid">
        <button
          className="workspace-entry workspace-entry-lapak"
          type="button"
          onClick={() => onNavigate("lapak", "Dashboard")}
          aria-label="Buka workspace Lapak"
        >
          <div className="workspace-entry-top">
            <span className="workspace-entry-icon">
              <ShoppingBag size={19} strokeWidth={1.9} />
            </span>
            <span className="workspace-entry-link">
              Buka Lapak <ArrowUpRight size={16} />
            </span>
          </div>
          <h3>Lapak</h3>
          <p>Kelola batch, pengadaan, komisi, penjualan, dan pengeluaran.</p>
          <div className="workspace-entry-metrics">
            <span>
              <strong>{business.batches.length}</strong>
              <small>batch tercatat</small>
            </span>
            <span>
              <strong>{money(lapakRevenue)}</strong>
              <small>pendapatan tercatat</small>
            </span>
          </div>
        </button>
        <button
          className="workspace-entry workspace-entry-resto"
          type="button"
          onClick={() => onNavigate("resto", "Dashboard")}
          aria-label="Buka workspace Resto dan Online"
        >
          <div className="workspace-entry-top">
            <span className="workspace-entry-icon">
              <Store size={19} strokeWidth={1.9} />
            </span>
            <span className="workspace-entry-link">
              Buka Resto &amp; Online <ArrowUpRight size={16} />
            </span>
          </div>
          <h3>Resto &amp; Online</h3>
          <p>Kelola stok, invoice, pembayaran, supplier, dan restoran.</p>
          <div className="workspace-entry-metrics">
            <span>
              <strong>{business.invoices.length}</strong>
              <small>invoice / order</small>
            </span>
            <span>
              <strong>{money(restoRevenue)}</strong>
              <small>{outstandingInvoices} invoice belum lunas</small>
            </span>
          </div>
        </button>
      </div>
    </section>
  );
}

type NavigateTarget = (
  module: Module,
  page: string,
  openForm?: boolean,
  invoiceId?: string,
  batchId?: string,
  formPage?: string,
) => void;

function OverviewAttentionPanel({
  business,
  onNavigate,
}: {
  business: BusinessState;
  onNavigate: NavigateTarget;
}) {
  const outstandingInvoices = business.invoices.filter(
    (invoice) => invoice.outstandingAmount > 0,
  );
  const lowStockProducts = business.products.filter(
    (product) =>
      product.status === "ACTIVE" &&
      product.stockBalance <= product.minimumStock,
  );
  const totalReceivables = outstandingInvoices.reduce(
    (sum, invoice) => sum + invoice.outstandingAmount,
    0,
  );
  const items = [
    {
      title: outstandingInvoices.length
        ? `${outstandingInvoices.length} invoice belum lunas`
        : "Tidak ada invoice tertunda",
      detail: outstandingInvoices.length
        ? `Total piutang ${money(totalReceivables)}`
        : "Semua invoice sudah dibayar",
      icon: CreditCard,
      tone: "navy-bg",
      module: "resto" as const,
      page: "Pembayaran",
    },
    {
      title: lowStockProducts.length
        ? `${lowStockProducts.length} produk menipis`
        : "Stok berada di atas minimum",
      detail: lowStockProducts.length
        ? "Perlu restock sebelum order berikutnya"
        : "Tidak ada stok yang perlu ditindak",
      icon: Database,
      tone: "blue-bg",
      module: "resto" as const,
      page: "Stok",
    },
    {
      title: business.batches.length
        ? `${business.batches.length} batch tercatat`
        : "Belum ada batch tercatat",
      detail: "Buka workspace Lapak untuk melihat detail",
      icon: Boxes,
      tone: "light-bg",
      module: "lapak" as const,
      page: "Batch",
    },
  ];

  return (
    <section className="panel operations-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Action center</p>
          <h2>Perlu ditindak</h2>
        </div>
        <Bell size={20} className="panel-icon" />
      </div>
      <div className="attention-list">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className="attention-row"
              type="button"
              key={item.title}
              onClick={() => onNavigate(item.module, item.page)}
            >
              <span className={`attention-icon ${item.tone}`}>
                <Icon size={16} />
              </span>
              <span className="attention-copy">
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
              <ChevronRight size={15} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function QuickAdd({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate: NavigateTarget;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="quick-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">Quick entry</p>
            <h2 id="quick-title">Catat transaksi baru</h2>
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
          Pilih jenis catatan. Form input akan langsung dibuka.
        </p>
        <div className="quick-options">
          <button
            type="button"
            onClick={() => onNavigate("lapak", "Batch", true)}
          >
            <span className="quick-icon">
              <Boxes size={18} />
            </span>
            <span>
              <strong>Batch Lapak</strong>
              <small>Buat batch baru dan mulai siklus Lapak</small>
            </span>
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={() => onNavigate("resto", "Invoice", true)}
          >
            <span className="quick-icon">
              <FileText size={18} />
            </span>
            <span>
              <strong>Invoice / pesanan</strong>
              <small>Restoran atau online order</small>
            </span>
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={() => onNavigate("resto", "Pengeluaran", true)}
          >
            <span className="quick-icon">
              <CreditCard size={18} />
            </span>
            <span>
              <strong>Pengeluaran</strong>
              <small>Biaya operasional Resto &amp; Online</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function GlobalSearchDialog({
  query,
  results,
  inputRef,
  onQueryChange,
  onClose,
  onSelect,
}: {
  query: string;
  results: GlobalSearchResult[];
  inputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onSelect: (result: GlobalSearchResult) => void;
}) {
  return (
    <div
      className="global-search-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="global-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Pencarian global"
      >
        <div className="global-search-field">
          <Search size={21} aria-hidden="true" />
          <input
            ref={inputRef}
            autoFocus
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Cari invoice, produk, pelanggan..."
            aria-label="Cari data bisnis"
          />
          <kbd>ESC</kbd>
          <button
            type="button"
            className="global-search-close"
            onClick={onClose}
            aria-label="Tutup pencarian"
          >
            <X size={18} />
          </button>
        </div>
        <div className="global-search-content">
          {!query.trim() ? (
            <p className="global-search-hint">
              Cari invoice, produk, restoran, supplier, batch, pembayaran, dan
              transaksi.
            </p>
          ) : results.length ? (
            <>
              <p className="global-search-caption">
                {results.length} hasil teratas
              </p>
              <div className="global-search-results">
                {results.map((result, index) => (
                  <button
                    className="global-search-result"
                    type="button"
                    key={`${result.kind}-${result.title}-${index}`}
                    onClick={() => onSelect(result)}
                  >
                    <span className="global-search-result-icon">
                      <Search size={17} />
                    </span>
                    <span className="global-search-result-copy">
                      <small>
                        {result.kind} · {moduleLabels[result.module]}
                      </small>
                      <strong>{result.title}</strong>
                      <span>{result.detail || result.page}</span>
                    </span>
                    <ArrowUpRight
                      size={16}
                      className="global-search-result-arrow"
                    />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="global-search-empty">
              <Search size={22} />
              <strong>Tidak ada hasil</strong>
              <span>Coba kata kunci atau nomor transaksi lain.</span>
            </div>
          )}
        </div>
        <footer className="global-search-footer">
          <span>
            Tekan <kbd>⌘ K</kbd> atau <kbd>Ctrl K</kbd> untuk mencari kapan saja
          </span>
          <button type="button" onClick={onClose}>
            Tutup <kbd>Esc</kbd>
          </button>
        </footer>
      </section>
    </div>
  );
}

type BusinessSession = ReturnType<typeof useLocalBusiness>;

function DashboardContent({ session }: { session: BusinessSession }) {
  const {
    state: business,
    accountUsers,
    actions,
    storageError,
    retryStorage,
  } = session;
  const pathname = usePathname();
  const router = useRouter();
  const location = useMemo(
    () =>
      dashboardLocationFromPath(pathname) ?? {
        module: "overview" as const,
        page: null,
      },
    [pathname],
  );
  const requestId = useRef(0);
  const activeModule = location.module;
  const activeNav = location.page;
  const [activityQuery, setActivityQuery] = useState("");
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const globalSearchInput = useRef<HTMLInputElement>(null);
  const [range, setRange] = useState<OverviewRange>("Bulan ini");
  const dashboard = useMemo(
    () => buildOverview(business, range),
    [business, range],
  );
  const globalSearchResults = useMemo(
    () => searchBusiness(business, globalSearchQuery),
    [business, globalSearchQuery],
  );
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [lapakPeriod, setLapakPeriod] = useState<LapakPeriod>("Semua");
  const [pendingRequest, setPendingRequest] = useState<{
    module: Module;
    page: string;
    id: number;
    openForm: boolean;
    formPage?: string;
  } | null>(null);
  const createRequest =
    pendingRequest?.module === activeModule &&
    pendingRequest.page === (activeNav ?? "")
      ? pendingRequest
      : null;
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "error" | "info";
  } | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setGlobalSearchQuery("");
        setGlobalSearchOpen(true);
      } else if (event.key === "Escape") {
        setGlobalSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const heading = useMemo(() => {
    if (activeModule === "lapak")
      return {
        title: "Dashboard Lapak",
        subtitle:
          "Pantau batch, komisi, penjualan, dan biaya operasional Lapak.",
      };
    if (activeModule === "resto")
      return {
        title: "Dashboard Resto & Online",
        subtitle:
          "Pantau stok, pesanan, pembayaran, dan profit penjualan seafood.",
      };
    return {
      title: "Ringkasan bisnis",
      subtitle: "Pantau performa Lapak dan Resto & Online dalam satu tempat.",
    };
  }, [activeModule]);

  const changeModule = (next: Module) => {
    navigateTo(next, next === "overview" ? "" : "Dashboard");
  };

  const navigateTo = (
    nextModule: Module,
    page: string,
    openForm = false,
    invoiceId?: string,
    batchId?: string,
    formPage?: string,
  ) => {
    if (!confirmDiscardChanges()) return;
    router.push(dashboardPathForTarget(nextModule, page, invoiceId, batchId));
    setShowQuickAdd(false);
    setPendingRequest(
      openForm
        ? {
            module: nextModule,
            page,
            id: ++requestId.current,
            openForm,
            formPage,
          }
        : null,
    );
  };

  const openSearchResult = (result: GlobalSearchResult) => {
    navigateTo(
      result.module,
      result.page,
      false,
      result.invoiceId,
      result.batchId,
    );
    setGlobalSearchOpen(false);
  };

  const notify = (
    message: string,
    tone: "success" | "error" | "info" = "info",
  ) => {
    const notification = { message, tone };
    setToast(notification);
    window.setTimeout(
      () => setToast((current) => (current === notification ? null : current)),
      tone === "error" ? 7000 : 2800,
    );
  };

  return (
    <div
      className={`app-shell ${activeModule === "overview" ? "overview-shell" : "module-shell"}`}
    >
      <header className="app-header">
        <BrandPill />
        <nav className="module-nav" role="tablist" aria-label="Pilih workspace">
          {(Object.keys(moduleLabels) as Module[]).map((key) => {
            const Icon =
              key === "overview"
                ? LayoutDashboard
                : key === "lapak"
                  ? Store
                  : ShoppingBag;
            return (
              <button
                className={activeModule === key ? "selected" : ""}
                onClick={() => changeModule(key)}
                role="tab"
                aria-label={moduleLabels[key]}
                title={moduleLabels[key]}
                aria-selected={activeModule === key}
                type="button"
                key={key}
              >
                <span className="module-nav-icon">
                  <Icon size={21} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <span className="module-nav-label">{moduleLabels[key]}</span>
              </button>
            );
          })}
        </nav>
        <div className="header-actions">
          <div className="action-pill">
            <button
              className="top-icon"
              aria-label="Cari"
              type="button"
              onClick={() => {
                setGlobalSearchQuery("");
                setGlobalSearchOpen(true);
              }}
            >
              <Search size={19} strokeWidth={1.9} />
            </button>
            <button
              className="top-icon"
              aria-label="Notifikasi"
              type="button"
              onClick={() => notify("Tidak ada notifikasi baru")}
            >
              <Bell size={19} strokeWidth={1.9} />
              <i />
            </button>
            <button
              className="top-icon"
              aria-label="Pengaturan"
              title="Pengaturan"
              type="button"
              onClick={() => navigateTo("resto", "Pengaturan")}
            >
              <Settings size={19} strokeWidth={1.9} />
            </button>
          </div>
          <AccountMenu />
        </div>
      </header>
      {globalSearchOpen && (
        <GlobalSearchDialog
          query={globalSearchQuery}
          results={globalSearchResults}
          inputRef={globalSearchInput}
          onQueryChange={setGlobalSearchQuery}
          onClose={() => setGlobalSearchOpen(false)}
          onSelect={openSearchResult}
        />
      )}
      <div className="body-layout">
        {activeModule !== "overview" && (
          <aside
            className="icon-rail sidebar-enter"
            aria-label={`Navigasi ${moduleLabels[activeModule]}`}
          >
            <div className="sidebar-heading">
              <span className="sidebar-kicker">Workspace aktif</span>
              <strong>{moduleLabels[activeModule]}</strong>
              <small>
                {
                  moduleDescriptions[
                    activeModule as Exclude<Module, "overview">
                  ]
                }
              </small>
            </div>
            <nav
              className="sidebar-nav"
              aria-label={`Menu ${moduleLabels[activeModule]}`}
            >
              {navItems[activeModule].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    className={`rail-btn ${activeNav === item.label ? "active" : ""}`}
                    key={item.label}
                    type="button"
                    title={item.label}
                    aria-label={item.label}
                    aria-current={activeNav === item.label ? "page" : undefined}
                    onClick={() => navigateTo(activeModule, item.label)}
                  >
                    <Icon size={20} strokeWidth={1.9} />
                    <span className="rail-label">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="rail-bottom">
              <button
                className="rail-btn"
                type="button"
                title="Pusat bantuan"
                aria-label="Pusat bantuan"
                onClick={() => notify("Pusat bantuan sedang disiapkan")}
              >
                <CircleHelp size={20} strokeWidth={1.9} />
                <span className="rail-label">Pusat bantuan</span>
              </button>
            </div>
          </aside>
        )}
        <main
          className="main-content"
          key={`${activeModule}-${activeNav ?? "overview"}`}
        >
          {storageError && (
            <div className="storage-error" role="alert">
              <div>
                <strong>Perhatian: penyimpanan data bermasalah</strong>
                <p>{storageError}</p>
              </div>
              <button
                className="secondary-outline-button"
                type="button"
                onClick={retryStorage}
              >
                Periksa ulang data
              </button>
            </div>
          )}
          {activeModule === "overview" && activeNav === null ? (
            <>
              <div className="welcome-row">
                <div>
                  <p className="eyebrow">
                    {activeModule === "overview"
                      ? "Global overview"
                      : activeModule === "lapak"
                        ? "Lapak module"
                        : "Resto & Online module"}
                  </p>
                  <h1>{heading.title}</h1>
                  <p>{heading.subtitle}</p>
                </div>
                <div className="welcome-actions">
                  <label className="range-select">
                    <CalendarDays size={16} />
                    <select
                      value={range}
                      onChange={(event) =>
                        setRange(event.target.value as OverviewRange)
                      }
                      aria-label="Periode laporan"
                    >
                      <option>Bulan ini</option>
                      <option>Kuartal ini</option>
                      <option>Tahun ini</option>
                    </select>
                    <ChevronDown size={14} />
                  </label>
                  <button
                    className="secondary-outline-button"
                    type="button"
                    onClick={() => navigateTo("overview", "Laporan")}
                  >
                    <FileText size={16} /> Laporan global
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => setShowQuickAdd(true)}
                  >
                    <Plus size={17} /> Catat transaksi
                  </button>
                </div>
              </div>
              <div className="overview-section-heading overview-summary-heading">
                <div>
                  <p className="eyebrow">Ringkasan</p>
                  <h2>Gambaran bisnis</h2>
                </div>
                <span className="overview-section-note">
                  Periode {range.toLowerCase()}
                </span>
              </div>
              <div className="stats-grid">
                {dashboard.stats.map((stat) => (
                  <StatCard key={stat.label} stat={stat} />
                ))}
              </div>
              <OverviewWorkspaceCards
                business={business}
                onNavigate={navigateTo}
              />
              <div className="main-grid">
                <ProfitChart dashboard={dashboard} />
                <WalletsPanel dashboard={dashboard} />
              </div>
              <div className="lower-grid">
                <ActivityTable
                  query={activityQuery}
                  onQueryChange={setActivityQuery}
                  dashboard={dashboard}
                  onNavigate={navigateTo}
                />
                <OverviewAttentionPanel
                  business={business}
                  onNavigate={navigateTo}
                />
              </div>
            </>
          ) : activeNav === "Dashboard" && activeModule === "lapak" ? (
            <LapakDashboard
              business={business}
              period={lapakPeriod}
              onPeriodChange={setLapakPeriod}
              onNavigate={navigateTo}
            />
          ) : activeNav === "Dashboard" && activeModule === "resto" ? (
            <RestoDashboardPage business={business} onNavigate={navigateTo} />
          ) : (
            <WorkspacePage
              key={`${activeModule}-${activeNav}-${location.invoiceId ?? location.batchId ?? createRequest?.id ?? "view"}`}
              module={activeModule}
              page={activeNav ?? ""}
              business={business}
              accountUsers={accountUsers}
              commands={actions}
              onNotify={notify}
              onNavigate={navigateTo}
              initialFormOpen={
                createRequest?.module === activeModule &&
                createRequest.page === activeNav &&
                createRequest.openForm
              }
              initialInvoiceId={location.invoiceId}
              initialBatchId={location.batchId}
              initialFormPage={createRequest?.formPage}
              initialCreateBatch={
                createRequest?.module === "lapak" &&
                createRequest.openForm &&
                !location.batchId &&
                (createRequest.page === "Batch" ||
                  createRequest.page === "Batches")
              }
            />
          )}
        </main>
      </div>
      {showQuickAdd && (
        <QuickAdd
          onClose={() => setShowQuickAdd(false)}
          onNavigate={navigateTo}
        />
      )}
      {toast && (
        <div
          className={`toast toast-${toast.tone}`}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          <span className="toast-check">
            {toast.tone === "error"
              ? "!"
              : toast.tone === "success"
                ? "✓"
                : "i"}
          </span>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default function DashboardShell() {
  const session = useLocalBusiness();
  const { status, loadError, retryStorage } = session;
  if (status === "ready") return <DashboardContent session={session} />;
  return (
    <main className="auth-page" aria-busy={status === "loading"}>
      {status === "failed" ? (
        <section className="auth-card" role="alert">
          <h1>Data belum bisa dimuat</h1>
          <p className="auth-lead">{loadError}</p>
          <button
            className="primary-button auth-submit"
            type="button"
            onClick={retryStorage}
          >
            Coba lagi
          </button>
        </section>
      ) : (
        <p className="auth-loading">Memuat data bisnis...</p>
      )}
    </main>
  );
}
