import type { Sourcing } from "@/src/domain/business-state";

export function sourcingPaid(item: Pick<Sourcing, "payment1" | "payment2" | "payment3">) {
  return item.payment1 + item.payment2 + item.payment3;
}

export function sourcingOutstanding(
  item: Pick<Sourcing, "total" | "payment1" | "payment2" | "payment3">,
) {
  return item.total - sourcingPaid(item);
}

export function sourcingTotals(items: Sourcing[]) {
  const total = items.reduce((sum, item) => sum + item.total, 0);
  const paid = items.reduce((sum, item) => sum + sourcingPaid(item), 0);
  return { total, paid, outstanding: total - paid };
}
