import type { BusinessState } from "@/src/domain/business-state";

type Batch = BusinessState["batches"][number];

// Total pendapatan dan biaya Lapak untuk satu periode. Fungsi murni: menerima data yang sudah
// difilter periode oleh pemanggil, sehingga aturan hitung tidak tergantung pada cara filter.
export function lapakPeriodTotals(
  data: {
    commissions: Pick<BusinessState["commissions"][number], "amount">[];
    sales: Pick<BusinessState["lapakSales"][number], "amount" | "kind">[];
    sourcings: Pick<BusinessState["sourcings"][number], "total">[];
    expenses: Pick<BusinessState["lapakExpenses"][number], "amount">[];
  },
) {
  return {
    commissionTotal: sumBy(data.commissions, (item) => item.amount),
    // Hanya kredit yang dihitung sebagai pendapatan; debit adalah pembayaran masuk, bukan penjualan.
    salesTotal: sumBy(data.sales, (item) => (item.kind === "KREDIT" ? item.amount : 0)),
    sourcingTotal: sumBy(data.sourcings, (item) => item.total),
    expenseTotal: sumBy(data.expenses, (item) => item.amount),
  };
}

// Jumlah komisi per batch. Dipakai di daftar batch Lapak untuk menampilkan total tiap batch.
export function commissionTotalForBatch(
  commissions: Pick<BusinessState["commissions"][number], "amount" | "batchId">[],
  batch: Pick<Batch, "id">,
) {
  return sumBy(
    commissions.filter((item) => item.batchId === batch.id),
    (item) => item.amount,
  );
}

// Jumlah pengeluaran per batch. Pasangan dari commissionTotalForBatch.
export function expenseTotalForBatch(
  expenses: Pick<BusinessState["lapakExpenses"][number], "amount" | "batchId">[],
  batch: Pick<Batch, "id">,
) {
  return sumBy(
    expenses.filter((item) => item.batchId === batch.id),
    (item) => item.amount,
  );
}

function sumBy<T>(items: readonly T[], pick: (item: T) => number) {
  return items.reduce((sum, item) => sum + pick(item), 0);
}
