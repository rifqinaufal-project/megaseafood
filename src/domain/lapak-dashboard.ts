import type { BusinessState } from "@/src/domain/business-state";
import { shiftDays } from "@/src/domain/lapak-periods";

type Batch = BusinessState["batches"][number];

export type DailyLapakTotal = {
  date: string;
  income: number;
  cost: number;
  profit: number;
};

export type BatchProfit = {
  batch: Batch;
  revenue: number;
  cost: number;
  profit: number;
};

/**
 * Pendapatan dan biaya per hari untuk `days` hari terakhir, berakhir pada `anchor`, terbaru dulu.
 * Pendapatan sama dengan dashboard: komisi ditambah kredit penjualan. Biaya berasal dari pengeluaran.
 */
export function dailyLapakTotals(
  business: Pick<BusinessState, "commissions" | "lapakSales" | "lapakExpenses">,
  anchor: string,
  days = 7,
): DailyLapakTotal[] {
  return Array.from({ length: days }, (_, index) => {
    const date = shiftDays(anchor, -index);
    const income =
      business.commissions
        .filter((item) => item.date === date)
        .reduce((sum, item) => sum + item.amount, 0) +
      business.lapakSales
        .filter((item) => item.date === date && item.kind === "KREDIT")
        .reduce((sum, item) => sum + item.amount, 0);
    const cost = business.lapakExpenses
      .filter((item) => item.date === date)
      .reduce((sum, item) => sum + item.amount, 0);
    return { date, income, cost, profit: income - cost };
  });
}

/**
 * Batch dengan profit tertinggi: komisi batch dikurangi pengeluaran batch.
 * Batch tanpa komisi maupun pengeluaran pada data yang diberikan tidak ikut.
 */
export function topProfitBatches(
  batches: readonly Batch[],
  commissions: BusinessState["commissions"],
  expenses: BusinessState["lapakExpenses"],
  limit = 3,
): BatchProfit[] {
  return batches
    .map((batch) => {
      const revenue = commissions
        .filter((item) => item.batchId === batch.id)
        .reduce((sum, item) => sum + item.amount, 0);
      const cost = expenses
        .filter((item) => item.batchId === batch.id)
        .reduce((sum, item) => sum + item.amount, 0);
      return { batch, revenue, cost, profit: revenue - cost };
    })
    .filter((item) => item.revenue > 0 || item.cost > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, limit);
}
