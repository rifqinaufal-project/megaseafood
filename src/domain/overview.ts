import { formatRupiah, today, type BusinessState } from "@/src/domain/business-state";
import type { ActivityRow, DashboardSnapshot, OverviewRange } from "@/src/domain/dashboard";
import { invoiceCostTotal, invoiceDirectCostTotal, invoiceTransactionProfit } from "@/src/domain/invoice";

const money = (value: number) => `${value < 0 ? "-" : ""}Rp ${formatRupiah(Math.abs(value))}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const CHART_MONTHS = 6;
const RECENT_LIMIT = 6;

const sum = <T,>(items: T[], pick: (item: T) => number) => items.reduce((total, item) => total + pick(item), 0);
const lapakSalePaid = (sale: BusinessState["lapakSales"][number]) => sale.payment1 + sale.payment2 + sale.payment3;

function inRange(range: OverviewRange, date: string, asOf: string) {
  if (range === "Tahun ini") return date.slice(0, 4) === asOf.slice(0, 4);
  if (date.slice(0, 4) !== asOf.slice(0, 4)) return false;
  if (range === "Bulan ini") return date.slice(5, 7) === asOf.slice(5, 7);
  return Math.floor((Number(date.slice(5, 7)) - 1) / 3) === Math.floor((Number(asOf.slice(5, 7)) - 1) / 3);
}

function lapakFigures(state: BusinessState, keep: (date: string) => boolean) {
  const commissions = state.commissions.filter((item) => keep(item.date));
  const sales = state.lapakSales.filter((item) => keep(item.date));
  const sourcings = state.sourcings.filter((item) => keep(item.date));
  const expenses = state.lapakExpenses.filter((item) => keep(item.date));
  const revenue = sum(commissions, (item) => item.amount) + sum(sales, (item) => item.totalAmount);
  const cost = sum(sourcings, (item) => item.total) + sum(expenses, (item) => item.amount);
  const batchIds = new Set([...commissions, ...sales, ...expenses].map((item) => item.batchId));
  return { revenue, cost, profit: revenue - cost, batches: batchIds.size, records: commissions.length + sales.length + sourcings.length + expenses.length };
}

function restoFigures(state: BusinessState, keep: (date: string) => boolean) {
  const invoices = state.invoices.filter((item) => keep(item.date));
  const expenses = state.operatingExpenses.filter((item) => keep(item.date));
  const revenue = sum(invoices, (item) => item.total);
  const operating = sum(expenses, (item) => item.amount);
  const cost = sum(invoices, (item) => invoiceCostTotal(item) + invoiceDirectCostTotal(item)) + operating;
  return { revenue, cost, profit: sum(invoices, invoiceTransactionProfit) - operating, orders: invoices.length };
}

const percent = (current: number, previous: number) => (previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100);
const dateLabel = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

function recentActivities(state: BusinessState): ActivityRow[] {
  const suppliers = new Map(state.suppliers.map((item) => [item.id, item.name]));
  return [
    ...state.invoices.map((item) => ({
      id: item.invoiceNumber,
      activity: `${item.salesChannel === "ONLINE" ? "Pesanan Online" : "Pesanan Restoran"} · ${item.customerName}`,
      amount: money(item.total),
      status: item.outstandingAmount > 0 ? ("Belum lunas" as const) : ("Lunas" as const),
      date: item.date,
    })),
    ...state.batches.map((item) => ({
      id: item.batchNumber,
      activity: `Batch Lapak · ${item.notes || "Tanpa catatan"}`,
      amount: money(
        sum(state.commissions.filter((row) => row.batchId === item.id), (row) => row.amount) +
          sum(state.lapakSales.filter((row) => row.batchId === item.id), (row) => row.totalAmount),
      ),
      status: "Berjalan" as const,
      date: item.startDate,
    })),
    ...state.receipts
      .filter((item) => item.status !== "CANCELLED")
      .map((item) => ({
        id: item.receiptNumber,
        activity: `Penerimaan stok · ${suppliers.get(item.supplierId) ?? "Supplier"}`,
        amount: money(item.subtotal),
        status: "Selesai" as const,
        date: item.date,
      })),
    ...state.sourcings.map((item) => ({
      id: `SOURCING-${item.sequence}`,
      activity: `${item.sourceType === "BENGKELAN" ? "Bengkelan" : "Pengadaan"} · ${item.name} · ${item.type}`,
      amount: money(item.total),
      status: "Tercatat" as const,
      date: item.date,
    })),
    ...state.operatingExpenses.map((item) => ({
      id: item.id.toUpperCase(),
      activity: `Biaya operasional · ${item.description}`,
      amount: money(item.amount),
      status: "Tercatat" as const,
      date: item.date,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_LIMIT)
    .map((item) => ({ ...item, date: dateLabel(item.date) }));
}

/** Seluruh angka Overview dihitung dari data bisnis akun; akun kosong menghasilkan nol, bukan contoh. */
export function buildOverview(state: BusinessState, range: OverviewRange, asOf = today()): DashboardSnapshot {
  const keep = (date: string) => inRange(range, date, asOf);
  const lapak = lapakFigures(state, keep);
  const resto = restoFigures(state, keep);
  const open = state.invoices.filter((item) => item.outstandingAmount > 0);

  const monthKeys = Array.from({ length: CHART_MONTHS }, (_, index) => {
    const date = new Date(Date.UTC(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)) - 1 - (CHART_MONTHS - 1 - index), 1));
    return date.toISOString().slice(0, 7);
  });
  const monthly = monthKeys.map((key) => {
    const inMonth = (date: string) => date.slice(0, 7) === key;
    const a = lapakFigures(state, inMonth);
    const b = restoFigures(state, inMonth);
    return { profit: a.profit + b.profit, cost: a.cost + b.cost };
  });
  const peak = Math.max(0, ...monthly.map((item) => Math.max(item.profit, item.cost)));
  const height = (value: number) => (peak === 0 ? 0 : Math.max(0, Math.round((value / peak) * 100)));
  const last = monthly[monthly.length - 1].profit;
  const change = percent(last, monthly[monthly.length - 2].profit);

  const cashIn =
     sum(state.invoices, (item) => item.paidAmount) +
     sum(state.commissions, (item) => item.amount) +
     sum(state.lapakSales, lapakSalePaid);
  const restoIn = sum(state.invoices, (item) => item.paidAmount);
  const cashOut =
    sum(state.supplierPayments, (item) => item.amount) +
    sum(state.sourcings, (item) => item.payment1 + item.payment2 + item.payment3) +
    sum(state.operatingExpenses, (item) => item.amount) +
    sum(state.lapakExpenses, (item) => item.amount);

  return {
    stats: [
      { label: "Profit gabungan", value: money(lapak.profit + resto.profit), change: `${lapak.records + resto.orders} transaksi`, detail: range.toLowerCase(), tone: "primary", iconKey: "wallet" },
      { label: "Profit Lapak", value: money(lapak.profit), change: `${lapak.batches} batch`, detail: "komisi + penjualan − biaya", tone: "soft", iconKey: "lapak" },
      { label: "Profit Resto & Online", value: money(resto.profit), change: `${resto.orders} pesanan`, detail: "setelah HPP dan biaya", tone: "soft", iconKey: "resto" },
      { label: "Piutang berjalan", value: money(sum(open, (item) => item.outstandingAmount)), change: `${open.length} invoice`, detail: open.length ? "perlu ditindaklanjuti" : "tidak ada tunggakan", tone: "warning", iconKey: "receivable" },
    ],
    activities: recentActivities(state),
    chart: {
      labels: monthKeys.map((key) => MONTHS[Number(key.slice(5, 7)) - 1]),
      profit: monthly.map((item) => height(item.profit)),
      cost: monthly.map((item) => height(item.cost)),
      hasData: peak > 0,
      total: money(sum(monthly, (item) => item.profit)),
      change: change === null ? null : `${Math.abs(change).toFixed(1).replace(".", ",")}%${change < 0 ? " turun" : ""}`,
    },
    cashTotal: money(cashIn - cashOut),
    cashNote: "Kas masuk dikurangi kas keluar, akumulasi seluruh waktu",
    wallets: [
      { name: "Kas masuk Resto & Online", description: "Pembayaran invoice diterima", amount: money(restoIn), tone: "navy" },
      { name: "Kas masuk Lapak", description: "Komisi dan penjualan", amount: money(cashIn - restoIn), tone: "blue" },
      { name: "Kas keluar", description: "Pembelian, biaya, dan pengeluaran", amount: money(cashOut), tone: "mist" },
    ],
  };
}
