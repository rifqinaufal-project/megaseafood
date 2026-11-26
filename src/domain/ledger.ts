import type { LapakSale } from "@/src/domain/business-state";
import { asWholeRupiah } from "@/src/domain/form-input";
import { inRange, type DateRange } from "@/src/domain/lapak-periods";

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

/**
 * Total untuk layar Tagihan saat periode dipilih: hanya transaksi dalam periode yang dihitung
 * untuk kredit dan debit, tetapi restan tetap saldo nyata pelanggan dari seluruh riwayat.
 */
export function ledgerPeriodTotals(groups: LedgerGroup[], range: DateRange | null) {
  if (!range) return ledgerTotals(groups);
  const scoped = groups
    .map((group) => {
      const lines = group.lines.filter((line) => inRange(line.row.date, range));
      return {
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
    restan: ledgerTotals(groups).restan,
  };
}

/** Total pratinjau editor Tagihan dari baris yang masih berupa teks input. */
export function ledgerPreviewTotals(rows: { kind: "KREDIT" | "DEBIT"; amount: string }[]) {
  return {
    previewCredit: rows
      .filter((row) => row.kind === "KREDIT")
      .reduce((sum, row) => sum + asWholeRupiah(row.amount), 0),
    previewDebit: rows
      .filter((row) => row.kind === "DEBIT")
      .reduce((sum, row) => sum + asWholeRupiah(row.amount), 0),
  };
}

/** Total kredit, debit, dan jumlah transaksi untuk satu bulan pada Buku Tagihan. */
export function ledgerMonthTotals(items: LedgerGroup[]) {
  return {
    credit: items.reduce((sum, group) => sum + group.credit, 0),
    debit: items.reduce((sum, group) => sum + group.debit, 0),
    transactions: items.reduce((sum, group) => sum + group.lines.length, 0),
  };
}
