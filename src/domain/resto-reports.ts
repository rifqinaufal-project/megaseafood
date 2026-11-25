import type {
  BusinessState,
  DirectCostCategory,
  Invoice,
  OperatingExpense,
  Receipt,
} from "@/src/domain/business-state";
import { localDate, receiptOutstanding } from "@/src/domain/business-integrity";
import {
  effectiveInvoiceStatus,
  invoiceCostTotal,
  invoiceDirectCostTotal,
  invoiceScaleMargin,
  invoiceTransactionProfit,
} from "@/src/domain/invoice";
import { DIRECT_COST_CATEGORIES } from "@/src/domain/settings";

export type ReportPeriod = "1d" | "7d" | "30d" | "all";

export const reportPeriods: { value: ReportPeriod; label: string }[] = [
  { value: "1d", label: "1 hari" },
  { value: "7d", label: "7 hari" },
  { value: "30d", label: "30 hari" },
  { value: "all", label: "Semua" },
];

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const periodDays: Record<Exclude<ReportPeriod, "all">, number> = { "1d": 1, "7d": 7, "30d": 30 };

export const periodTitle = (period: ReportPeriod) =>
  period === "1d" ? "Hari ini" : period === "all" ? "Semua data" : `${periodDays[period]} hari terakhir`;

/** Data lokal bisa lebih lama dari hari ini, jadi periode mengacu pada transaksi terakhir. */
export function reportAnchor(state: BusinessState, asOf = localDate()): string {
  const dates = [
    ...state.invoices.map((item) => item.date),
    ...state.operatingExpenses.map((item) => item.date),
    ...state.receipts.map((item) => item.date),
  ].sort();
  const latest = dates.at(-1);
  return latest && latest < asOf ? latest : asOf;
}

export function periodRange(period: ReportPeriod, anchor: string) {
  if (period === "all") return { start: "0000-01-01", end: anchor, previous: null };
  const days = periodDays[period];
  const start = shiftDate(anchor, -(days - 1));
  return {
    start,
    end: anchor,
    previous: { start: shiftDate(start, -days), end: shiftDate(start, -1) },
  };
}

const within = (date: string, start: string, end: string) => date >= start && date <= end;

const percentChange = (current: number, previous: number) =>
  previous === 0 ? (current === 0 ? 0 : 100) : ((current - previous) / previous) * 100;

export type DailyPoint = { date: string; revenue: number; orders: number; profit: number };

export type RestoReport = {
  anchor: string;
  period: ReportPeriod;
  label: string;
  invoices: Invoice[];
  expenses: OperatingExpense[];
  receipts: Receipt[];
  daily: DailyPoint[];
  expenseByCategory: { category: string; amount: number }[];
  directCostByCategory: { category: DirectCostCategory; amount: number }[];
  metrics: {
    orders: number;
    ordersChange: number | null;
    revenue: number;
    revenueChange: number | null;
    hpp: number;
    grossProfit: number;
    directCosts: number;
    transactionProfit: number;
    scaleMargin: number;
    operatingExpenses: number;
    netProfit: number;
    netMargin: number;
    receivables: number;
    receivableCount: number;
    overdueCount: number;
    overdueAmount: number;
    paidAmount: number;
    paidProfit: number;
    paidScaleMargin: number;
    inventoryValue: number;
  };
};

export function buildRestoReport(state: BusinessState, period: ReportPeriod, asOf = localDate()): RestoReport {
  const anchor = reportAnchor(state, asOf);
  const range = periodRange(period, anchor);
  const invoices = state.invoices.filter((item) => within(item.date, range.start, range.end));
  const expenses = state.operatingExpenses.filter((item) => within(item.date, range.start, range.end));
  const receipts = state.receipts.filter((item) => within(item.date, range.start, range.end));
  const previous = range.previous
    ? state.invoices.filter((item) => within(item.date, range.previous!.start, range.previous!.end))
    : null;

  const revenue = invoices.reduce((sum, item) => sum + item.total, 0);
  const hpp = invoices.reduce((sum, item) => sum + invoiceCostTotal(item), 0);
  const scaleMargin = invoices.reduce((sum, item) => sum + invoiceScaleMargin(item), 0);
  const operatingExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
  const directCosts = invoices.reduce((sum, item) => sum + invoiceDirectCostTotal(item), 0);
  const grossProfit = revenue - hpp;
  const transactionProfit = grossProfit - directCosts;
  const netProfit = transactionProfit - operatingExpenses;
  const open = invoices.filter((item) => item.outstandingAmount > 0);
  const overdue = open.filter((item) => effectiveInvoiceStatus(item, asOf) === "OVERDUE");
  const paidRatio = (item: Invoice) => (item.total > 0 ? Math.min(item.paidAmount / item.total, 1) : 0);

  const days = new Map<string, DailyPoint>();
  const day = (date: string) => {
    const current = days.get(date) ?? { date, revenue: 0, orders: 0, profit: 0 };
    days.set(date, current);
    return current;
  };
  for (const item of invoices) {
    const point = day(item.date);
    point.revenue += item.total;
    point.orders += 1;
    point.profit += invoiceTransactionProfit(item);
  }
  for (const item of expenses) day(item.date).profit -= item.amount;

  const categories = new Map<string, number>();
  for (const item of expenses) categories.set(item.category, (categories.get(item.category) ?? 0) + item.amount);

  const directByCategory = new Map<DirectCostCategory, number>();
  for (const item of invoices)
    for (const cost of item.directCosts ?? [])
      directByCategory.set(cost.category, (directByCategory.get(cost.category) ?? 0) + cost.amount);

  return {
    anchor,
    period,
    label: periodTitle(period),
    invoices,
    expenses,
    receipts,
    daily: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    expenseByCategory: [...categories]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    directCostByCategory: DIRECT_COST_CATEGORIES.filter((category) => directByCategory.has(category))
      .map((category) => ({ category, amount: directByCategory.get(category)! }))
      .sort((a, b) => b.amount - a.amount),
    metrics: {
      orders: invoices.length,
      ordersChange: previous ? percentChange(invoices.length, previous.length) : null,
      revenue,
      revenueChange: previous ? percentChange(revenue, previous.reduce((sum, item) => sum + item.total, 0)) : null,
      hpp,
      grossProfit,
      directCosts,
      transactionProfit,
      scaleMargin,
      operatingExpenses,
      netProfit,
      netMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
      receivables: open.reduce((sum, item) => sum + item.outstandingAmount, 0),
      receivableCount: open.length,
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((sum, item) => sum + item.outstandingAmount, 0),
      paidAmount: invoices.reduce((sum, item) => sum + item.paidAmount, 0),
      paidProfit: invoices.reduce((sum, item) => sum + invoiceTransactionProfit(item) * paidRatio(item), 0),
      paidScaleMargin: invoices.reduce((sum, item) => sum + invoiceScaleMargin(item) * paidRatio(item), 0),
      inventoryValue: state.products
        .filter((item) => item.status === "ACTIVE" && item.trackStock !== false)
        .reduce((sum, item) => sum + item.stockBalance * item.averageHpp, 0),
    },
  };
}

export type SupplierBillStatus = "OPEN" | "OVERDUE" | "PAID" | "VERIFY" | "CANCELLED";

export function supplierBillStatus(receipt: Receipt, asOf = localDate()): SupplierBillStatus {
  if (receipt.status === "CANCELLED") return "CANCELLED";
  const outstanding = receiptOutstanding(receipt);
  if (outstanding === null) return "VERIFY";
  if (outstanding <= 0) return "PAID";
  return receipt.dueDate && receipt.dueDate < asOf ? "OVERDUE" : "OPEN";
}

export function supplierPayableSummary(receipts: Receipt[], asOf = localDate()) {
  const open = receipts.filter((item) => {
    const status = supplierBillStatus(item, asOf);
    return status === "OPEN" || status === "OVERDUE";
  });
  const overdue = open.filter((item) => supplierBillStatus(item, asOf) === "OVERDUE");
  const sum = (items: Receipt[]) => items.reduce((total, item) => total + (receiptOutstanding(item) ?? 0), 0);
  return {
    total: sum(open),
    openCount: open.length,
    overdueCount: overdue.length,
    overdueAmount: sum(overdue),
    unverifiedCount: receipts.filter((item) => supplierBillStatus(item, asOf) === "VERIFY").length,
  };
}
