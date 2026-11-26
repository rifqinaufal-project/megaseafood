import type { InvoiceCalculation } from "@/src/domain/invoice";

// Ringkasan panel samping editor invoice. Fungsi ini murni dan hanya membaca hasil
// calculateInvoice, jadi UI tidak perlu menjumlahkan ulang angka keuangan.
// Nilai non-finite diganti 0 supaya kolom tampilan tidak menampilkan NaN.

export const finite = (value: number) => (Number.isFinite(value) ? value : 0);

export type InvoiceEditorSummary = {
  hppTotal: number;
  marginQty: number;
  marginRevenue: number;
  directTotal: number;
  revenue: number;
  profit: number;
  marginPercent: number;
  productProfit: number;
};

export function invoiceEditorSummary(
  calculated: Pick<InvoiceCalculation, "items" | "directCosts" | "total">,
): InvoiceEditorSummary {
  const hppTotal = calculated.items.reduce(
    (sum, item) => sum + finite(item.hppTotal),
    0,
  );
  const marginQty = calculated.items.reduce(
    (sum, item) => sum + Math.max(finite(item.marginQuantity), 0),
    0,
  );
  const marginRevenue = calculated.items.reduce(
    (sum, item) =>
      sum +
      Math.max(finite(item.marginQuantity), 0) * finite(item.sellingPrice),
    0,
  );
  const directTotal = calculated.directCosts.reduce(
    (sum, cost) => sum + finite(cost.amount),
    0,
  );
  const revenue = finite(calculated.total);
  const profit = revenue - hppTotal - directTotal;
  return {
    hppTotal,
    marginQty,
    marginRevenue,
    directTotal,
    revenue,
    profit,
    marginPercent: revenue > 0 ? (profit / revenue) * 100 : 0,
    productProfit: revenue - hppTotal,
  };
}
