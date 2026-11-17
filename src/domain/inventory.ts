import type { Product, Receipt, ReceiptItem, StockMovementType } from "@/src/domain/business-state";

export const PRODUCT_CATEGORIES = ["Ikan", "Udang", "Cumi", "Gurita", "Kepiting", "Kerang", "Lobster"] as const;
export const PRODUCT_UNITS = ["kg", "gram", "ekor", "pcs", "pack", "box", "karton"] as const;
export const CUSTOM_PRODUCT_OPTION = "__custom__";

export type StockStatus = "Habis" | "Menipis" | "Aman";

export function getStockStatus(quantity: number, minimumQuantity: number): StockStatus {
  if (quantity <= 0) return "Habis";
  if (minimumQuantity > 0 && quantity <= minimumQuantity) return "Menipis";
  return "Aman";
}

/** Moving-average HPP for a receipt paid by manual weight and stocked by digital weight. */
export function calculateReceiptWeightedAverageCost(
  currentQuantity: number,
  currentAverageCost: number,
  manualQuantity: number,
  digitalQuantity: number,
  supplierUnitCost: number,
) {
  const quantityAfter = currentQuantity + digitalQuantity;
  if (quantityAfter <= 0) return 0;
  return (currentQuantity * currentAverageCost + manualQuantity * supplierUnitCost) / quantityAfter;
}

/** Allocates the amount actually paid across the weight that entered stock. */
export function calculateEffectiveReceiptCost(manualQuantity: number, digitalQuantity: number, supplierUnitCost: number) {
  if (digitalQuantity <= 0) return 0;
  return Math.round(((manualQuantity * supplierUnitCost) / digitalQuantity) * 100) / 100;
}

export function calculateWeightDifference(manualQuantity: number, digitalQuantity: number) {
  return Math.round((digitalQuantity - manualQuantity) * 1000) / 1000;
}

export function calculateMargin(sellingPrice: number, averageCost: number) {
  const nominal = sellingPrice - averageCost;
  return { nominal, percentage: sellingPrice > 0 ? (nominal / sellingPrice) * 100 : 0 };
}

export function receiptItemSubtotal(item: Pick<ReceiptItem, "manualQuantity" | "unitCost">) {
  return Math.round(item.manualQuantity * item.unitCost);
}

export function receiptSubtotal(items: ReceiptItem[]) {
  return items.reduce((sum, item) => sum + receiptItemSubtotal(item), 0);
}

export function validateReceiptItems(items: ReceiptItem[]): string | null {
  if (!items.length) return "Tambahkan minimal satu produk.";
  if (items.some((item) => !item.productId || !Number.isFinite(item.manualQuantity) || item.manualQuantity <= 0 || !Number.isFinite(item.digitalQuantity) || item.digitalQuantity <= 0 || !Number.isFinite(item.unitCost) || item.unitCost <= 0)) {
    return "Semua produk harus memiliki berat dan harga beli lebih dari 0.";
  }
  if (new Set(items.map((item) => item.productId)).size !== items.length) return "Produk yang sama cukup dicatat satu kali dalam satu penerimaan.";
  return null;
}

export function validateStockAdjustment(actualQuantity: number, currentQuantity: number, notes: string): string | null {
  if (!Number.isFinite(actualQuantity) || actualQuantity < 0) return "Stok aktual tidak boleh negatif.";
  if (actualQuantity !== currentQuantity && !notes.trim()) return "Alasan perubahan wajib diisi jika stok aktual berubah.";
  return null;
}

export function stockMovementLabel(type: StockMovementType) {
  const labels: Record<StockMovementType, string> = {
    PURCHASE_IN: "Barang masuk",
    SALE_OUT: "Keluar untuk invoice",
    INVOICE_VOID_RETURN: "Pengembalian invoice",
    ADJUSTMENT_IN: "Penyesuaian masuk",
    ADJUSTMENT_OUT: "Penyesuaian keluar",
    RECEIPT_CANCEL_OUT: "Pembatalan penerimaan",
    COST_ADJUSTMENT: "Koreksi HPP",
  };
  return labels[type] ?? type;
}

export function productDisplayName(product: Pick<Product, "name" | "size">) {
  const size = product.size.trim();
  return size && !product.name.toLowerCase().includes(size.toLowerCase()) ? `${product.name} ${size}` : product.name;
}

export function skuFromName(name: string, category: string, existing: string[]) {
  const letters = (value: string) => value.normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase();
  const prefix = (letters(name).slice(0, 3) || letters(category).slice(0, 3) || "PRD").padEnd(3, "X");
  const taken = new Set(existing.map((sku) => sku.toLowerCase()));
  for (let index = 1; index < 10000; index += 1) {
    const sku = `${prefix}-${String(index).padStart(3, "0")}`;
    if (!taken.has(sku.toLowerCase())) return sku;
  }
  return `${prefix}-${Date.now()}`;
}

export type WeightDifferenceRow = {
  id: string;
  receiptNumber: string;
  date: string;
  supplierId: string;
  productId: string;
  manualQuantity: number;
  digitalQuantity: number;
  difference: number;
  unitCost: number;
  effectiveUnitCost: number;
  hppReduction: number;
  estimatedStockValue: number;
};

export function weightDifferenceRows(receipts: Receipt[]): WeightDifferenceRow[] {
  const rows: WeightDifferenceRow[] = [];
  for (const receipt of receipts) {
    if (receipt.status !== "POSTED") continue;
    receipt.items.forEach((item, index) => {
      const difference = calculateWeightDifference(item.manualQuantity, item.digitalQuantity);
      if (difference <= 0) return;
      const effectiveUnitCost = calculateEffectiveReceiptCost(item.manualQuantity, item.digitalQuantity, item.unitCost);
      rows.push({
        id: `${receipt.id}-${index}`,
        receiptNumber: receipt.receiptNumber,
        date: receipt.date,
        supplierId: receipt.supplierId,
        productId: item.productId,
        manualQuantity: item.manualQuantity,
        digitalQuantity: item.digitalQuantity,
        difference,
        unitCost: item.unitCost,
        effectiveUnitCost,
        hppReduction: Math.round(Math.max(item.unitCost - effectiveUnitCost, 0) * 100) / 100,
        estimatedStockValue: Math.round(difference * item.unitCost),
      });
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.receiptNumber.localeCompare(a.receiptNumber));
}
