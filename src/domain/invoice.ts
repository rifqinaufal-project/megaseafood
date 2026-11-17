import type {
  BusinessState,
  DirectCostCategory,
  Invoice,
  InvoiceDirectCost,
  InvoiceItem,
  SalesChannel,
} from "@/src/domain/business-state";
import { DIRECT_COST_CATEGORIES } from "@/src/domain/settings";
import {
  addCalendarDays,
  isBusinessDate,
} from "@/src/domain/business-integrity";

export type InvoiceLineInput = {
  productId: string;
  quantity: number;
  marginQuantity: number;
  sellingPrice: number;
};
export type InvoiceDirectCostInput = {
  id: string;
  category: DirectCostCategory;
  name: string;
  amount: number;
};
export type InvoiceInput = {
  channel: SalesChannel;
  restaurantId: string;
  customerName: string;
  date: string;
  dueDate: string;
  items: InvoiceLineInput[];
  directCosts?: InvoiceDirectCostInput[];
  discount: number;
  expectedRevision?: number;
};
export type InvoiceCalculation = ReturnType<typeof calculateInvoice>;

export const invoiceStatus = (
  total: number,
  paid: number,
): Invoice["status"] =>
  paid >= total ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "ISSUED";
export type EffectiveInvoiceStatus = Invoice["status"] | "OVERDUE";
export const effectiveInvoiceStatus = (
  invoice: Pick<Invoice, "status" | "outstandingAmount" | "dueDate">,
  asOf: string,
): EffectiveInvoiceStatus =>
  invoice.status !== "PAID" &&
  invoice.outstandingAmount > 0 &&
  invoice.dueDate &&
  invoice.dueDate < asOf
    ? "OVERDUE"
    : invoice.status;
/** Tambahan nilai dari selisih timbangan (qty margin x harga jual). */
export const invoiceScaleMargin = (invoice: Pick<Invoice, "items">) =>
  invoice.items.reduce(
    (sum, item) =>
      sum + Math.max(item.marginQuantity, 0) * Math.max(item.sellingPrice, 0),
    0,
  );
export const invoiceCostTotal = (invoice: Pick<Invoice, "items">) =>
  invoice.items.reduce((sum, item) => sum + item.hppTotal, 0);
export const invoiceDirectCostTotal = (
  invoice: Pick<Invoice, "directCosts">,
) => (invoice.directCosts ?? []).reduce((sum, cost) => sum + cost.amount, 0);
/** Laba transaksi: pendapatan dikurangi HPP produk dan biaya internal invoice. */
export const invoiceTransactionProfit = (
  invoice: Pick<Invoice, "items" | "directCosts" | "total">,
) => invoice.total - invoiceCostTotal(invoice) - invoiceDirectCostTotal(invoice);
export const invoiceStatusLabel = (status: Invoice["status"]) =>
  status === "PAID"
    ? "Lunas"
    : status === "PARTIALLY_PAID"
      ? "Dibayar sebagian"
      : "Belum dibayar";
export const defaultDueDate = (date: string, days: number) =>
  isBusinessDate(date) ? addCalendarDays(date, days) : "";
export const sumStockQuantities = (items: InvoiceItem[]) =>
  items.reduce<Record<string, number>>(
    (totals, item) => ({
      ...totals,
      [item.productId]: (totals[item.productId] ?? 0) + item.stockQuantity,
    }),
    {},
  );

export function calculateInvoice(
  state: BusinessState,
  input: InvoiceInput,
  previous?: Invoice,
) {
  const errors: Record<string, string> = {};
  if (!["RESTAURANT", "ONLINE"].includes(input.channel))
    errors.channel = "Pilih channel penjualan.";
  const restaurant = state.restaurants.find(
    (item) => item.id === input.restaurantId,
  );
  if (
    input.channel === "RESTAURANT" &&
    (!restaurant ||
      (restaurant.status !== "ACTIVE" &&
        previous?.restaurantId !== restaurant.id))
  )
    errors.restaurantId = "Pilih restoran aktif.";
  if (!input.customerName.trim())
    errors.customerName = "Nama pelanggan wajib diisi.";
  if (!isBusinessDate(input.date)) errors.date = "Tanggal invoice tidak valid.";
  if (!isBusinessDate(input.dueDate) || input.dueDate < input.date)
    errors.dueDate = "Jatuh tempo tidak boleh sebelum tanggal invoice.";
  if (!Number.isSafeInteger(input.discount) || input.discount < 0)
    errors.discount = "Diskon harus berupa Rupiah utuh, minimal 0.";
  const directCosts: InvoiceDirectCost[] = [];
  (input.directCosts ?? []).forEach((cost, index) => {
    if (!DIRECT_COST_CATEGORIES.includes(cost.category))
      errors[`directCosts.${index}.category`] = "Pilih kategori biaya.";
    if (!cost.name.trim())
      errors[`directCosts.${index}.name`] = "Keterangan biaya wajib diisi.";
    if (!Number.isSafeInteger(cost.amount) || cost.amount <= 0)
      errors[`directCosts.${index}.amount`] =
        "Nominal biaya harus Rupiah utuh lebih dari 0.";
    directCosts.push({
      id: cost.id,
      category: cost.category,
      name: cost.name.trim(),
      amount: cost.amount,
    });
  });
  const legacy = !!previous && previous.items.length === 0;
  if (
    legacy &&
    (input.items.length > 0 || input.discount !== previous.discount)
  )
    errors.items =
      "Invoice lama tanpa rincian produk hanya bisa dikoreksi informasi pelanggan dan tanggalnya.";
  if (!legacy && input.items.length === 0)
    errors.items = "Tambahkan setidaknya satu produk.";
  const oldQuantities = sumStockQuantities(previous?.items ?? []);
  if (
    Object.keys(oldQuantities).some(
      (id) => !state.products.some((product) => product.id === id),
    )
  )
    errors.items =
      "Produk invoice lama tidak ditemukan; koreksi stok belum dapat dihitung dengan aman.";
  const oldCosts = (previous?.items ?? []).reduce<Record<string, number>>(
    (totals, item) => ({
      ...totals,
      [item.productId]: (totals[item.productId] ?? 0) + item.hppTotal,
    }),
    {},
  );
  const quantities: Record<string, number> = {};
  input.items.forEach((line, index) => {
    const product = state.products.find((item) => item.id === line.productId);
    if (
      !product ||
      (product.status !== "ACTIVE" && !oldQuantities[line.productId])
    )
      errors[`items.${index}.productId`] = "Pilih produk aktif.";
    if (!Number.isFinite(line.quantity) || line.quantity <= 0)
      errors[`items.${index}.quantity`] = "Qty keluar harus lebih dari 0.";
    if (!Number.isFinite(line.marginQuantity) || line.marginQuantity < 0)
      errors[`items.${index}.marginQuantity`] =
        "Tambahan qty tagihan minimal 0.";
    if (!Number.isSafeInteger(line.sellingPrice) || line.sellingPrice <= 0)
      errors[`items.${index}.sellingPrice`] =
        "Harga jual harus Rupiah utuh, lebih dari 0.";
    quantities[line.productId] =
      (quantities[line.productId] ?? 0) + line.quantity;
  });
  for (const [id, quantity] of Object.entries(quantities)) {
    const product = state.products.find((item) => item.id === id);
    const available = (product?.stockBalance ?? 0) + (oldQuantities[id] ?? 0);
    if (product && quantity > available + 1e-9)
      input.items.forEach((line, index) => {
        if (line.productId === id)
          errors[`items.${index}.quantity`] =
            `Total qty produk ini ${quantity}; tersedia ${Number(available.toFixed(6))} ${product.unit} (termasuk qty invoice lama).`;
      });
  }
  // Retain historical cost for existing quantities; only added stock uses today's average HPP.
  const unitCosts: Record<string, number> = {};
  for (const [id, quantity] of Object.entries(quantities)) {
    const oldQuantity = oldQuantities[id] ?? 0;
    const product = state.products.find((item) => item.id === id);
    const retained = Math.min(oldQuantity, quantity);
    unitCosts[id] =
      quantity > 0
        ? ((oldQuantity > 0 ? (retained * oldCosts[id]) / oldQuantity : 0) +
            Math.max(0, quantity - oldQuantity) * (product?.averageHpp ?? 0)) /
          quantity
        : 0;
  }
  const items: InvoiceItem[] = input.items.map((line) => {
    const product = state.products.find((item) => item.id === line.productId);
    const historical = previous?.items.find(
      (item) => item.productId === line.productId,
    );
    const billingQuantity = line.quantity + line.marginQuantity;
    const subtotal = Math.round(billingQuantity * line.sellingPrice);
    const hpp = unitCosts[line.productId] ?? 0;
    const hppTotal = line.quantity * hpp;
    return {
      productId: line.productId,
      productName: historical?.productName ?? product?.name ?? "",
      unit: historical?.unit ?? product?.unit ?? "",
      stockQuantity: line.quantity,
      marginQuantity: line.marginQuantity,
      billingQuantity,
      sellingPrice: line.sellingPrice,
      hpp,
      hppTotal,
      subtotal,
      profit: subtotal - hppTotal,
    };
  });
  const subtotal = legacy
    ? previous.subtotal
    : items.reduce((sum, line) => sum + line.subtotal, 0);
  if (input.discount > subtotal)
    errors.discount = "Diskon tidak boleh melebihi subtotal.";
  const total = legacy ? previous.total : subtotal - input.discount;
  if (
    legacy
      ? !Number.isFinite(subtotal) || !Number.isFinite(total)
      : !Number.isSafeInteger(subtotal) || !Number.isSafeInteger(total)
  )
    errors.total = "Nilai tagihan melampaui batas perhitungan.";
  if (previous && total < previous.paidAmount)
    errors.total =
      "Total baru lebih kecil dari pembayaran masuk. Koreksi pembayaran terlebih dahulu.";
  const newCosts = items.reduce<Record<string, number>>(
    (totals, item) => ({
      ...totals,
      [item.productId]: (totals[item.productId] ?? 0) + item.hppTotal,
    }),
    {},
  );
  const products = state.products.map((product) => {
    const oldQty = oldQuantities[product.id] ?? 0;
    const newQty = quantities[product.id] ?? 0;
    if (!oldQty && !newQty) return product;
    const stockBalance = Math.max(
      0,
      Number((product.stockBalance + oldQty - newQty).toFixed(9)),
    );
    const inventoryValue =
      product.stockBalance * product.averageHpp +
      (oldCosts[product.id] ?? 0) -
      (newCosts[product.id] ?? 0);
    const averageHpp =
      stockBalance > 0 ? inventoryValue / stockBalance : product.averageHpp;
    if (!Number.isFinite(averageHpp) || averageHpp < -1e-6)
      errors.items = "Nilai HPP tidak valid; periksa data stok.";
    return { ...product, stockBalance, averageHpp: Math.max(0, averageHpp) };
  });
  for (const item of items)
    if (!Number.isFinite(item.hppTotal))
      errors.items = "Nilai HPP melampaui batas perhitungan.";
  const paidAmount = previous?.paidAmount ?? 0;
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    items,
    directCosts,
    products,
    subtotal,
    total,
    paidAmount,
    outstandingAmount: total - paidAmount,
    status: invoiceStatus(total, paidAmount),
  };
}

export function restoreInvoiceStock(state: BusinessState, invoice: Invoice) {
  return state.products.map((product) => {
    const lines = invoice.items.filter((item) => item.productId === product.id);
    if (!lines.length) return product;
    const returnedQuantity = lines.reduce(
      (sum, line) => sum + line.stockQuantity,
      0,
    );
    const returnedCost = lines.reduce((sum, line) => sum + line.hppTotal, 0);
    const stockBalance = Number(
      (product.stockBalance + returnedQuantity).toFixed(9),
    );
    return {
      ...product,
      stockBalance,
      averageHpp:
        stockBalance > 0
          ? (product.stockBalance * product.averageHpp + returnedCost) /
            stockBalance
          : product.averageHpp,
    };
  });
}
