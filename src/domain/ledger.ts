import type { LapakSale } from "@/src/domain/business-state";

export type LedgerLine = {
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
