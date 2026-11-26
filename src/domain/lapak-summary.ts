import type { Commission, LapakExpense } from "@/src/domain/business-state";
import { inRange, type DateRange } from "@/src/domain/lapak-periods";

export type CommissionSummary = {
  count: number;
  total: number;
  partners: number;
  average: number;
};

export type LapakExpenseSummary = {
  count: number;
  total: number;
  batches: number;
  average: number;
};

/** Calculates the commission metrics shown above the Lapak commission list. */
export function commissionSummary(
  items: readonly Commission[],
  range: DateRange | null,
): CommissionSummary {
  const commissions = items.filter((item) => inRange(item.date, range));
  const total = commissions.reduce((sum, item) => sum + item.amount, 0);
  const partners = new Set(
    commissions.map((item) => item.partner.trim()).filter(Boolean),
  ).size;

  return {
    count: commissions.length,
    total,
    partners,
    average: commissions.length ? total / commissions.length : 0,
  };
}

/** Calculates the expense metrics shown above the Lapak expense list. */
export function lapakExpenseSummary(
  items: readonly LapakExpense[],
  range: DateRange | null,
): LapakExpenseSummary {
  const expenses = items.filter((item) => inRange(item.date, range));
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);
  const batches = new Set(expenses.map((item) => item.batchId)).size;

  return {
    count: expenses.length,
    total,
    batches,
    average: expenses.length ? total / expenses.length : 0,
  };
}
