import type { jsPDF } from "jspdf";
import { formatRupiah, type BusinessState, type Invoice } from "@/src/domain/business-state";
import { invoiceScaleMargin, invoiceStatusLabel } from "@/src/domain/invoice";

const money = (value: number) => `Rp ${formatRupiah(value)}`;
const quantity = (value: number) => value.toLocaleString("id-ID", { maximumFractionDigits: 6 });

const ACCENT: [number, number, number] = [27, 54, 104];
const INK: [number, number, number] = [26, 26, 26];
const MUTED: [number, number, number] = [110, 110, 105];
const LINE: [number, number, number] = [225, 225, 220];
const MARGIN_X = 15;
const PAGE_W = 210;
const PAGE_H = 297;
const RIGHT = PAGE_W - MARGIN_X;

export const invoiceFileName = (invoice: Invoice) => `${invoice.invoiceNumber.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;

type Row = { name: string; size: string; qty: string; margin: string; unit: string; price: string; subtotal: string };

function rowsOf(invoice: Invoice, business: BusinessState): Row[] {
  return invoice.items.map((line) => {
    const product = business.products.find((item) => item.id === line.productId);
    const size = product?.size.trim() ?? "";
    const full = line.productName ?? product?.name ?? "Produk tidak ditemukan";
    return {
      name: size && full.endsWith(size) ? full.slice(0, -size.length).trim() : full,
      size: size || "-",
      qty: quantity(line.stockQuantity),
      margin: line.marginQuantity > 0 ? `+${quantity(line.marginQuantity)}` : "-",
      unit: line.unit ?? product?.unit ?? "",
      price: money(line.sellingPrice),
      subtotal: money(line.subtotal),
    };
  });
}

/** Membuat PDF invoice pelanggan. HPP, margin laba, dan biaya internal sengaja tidak dimasukkan. */
export async function buildInvoicePdf(invoice: Invoice, business: BusinessState): Promise<jsPDF> {
  const { jsPDF: PDF } = await import("jspdf");
  const doc = new PDF({ unit: "mm", format: "a4" });
  const { company } = business;
  const restaurant = business.restaurants.find((item) => item.id === invoice.restaurantId);
  let y = 20;

  const text = (value: string, x: number, at: number, options?: { align?: "left" | "right" | "center"; size?: number; bold?: boolean; color?: [number, number, number] }) => {
    doc.setFont("helvetica", options?.bold ? "bold" : "normal");
    doc.setFontSize(options?.size ?? 10);
    doc.setTextColor(...(options?.color ?? INK));
    doc.text(value, x, at, { align: options?.align ?? "left" });
  };
  const rule = (at: number) => {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_X, at, RIGHT, at);
  };

  text(company.name, MARGIN_X, y, { size: 20, bold: true, color: ACCENT });
  text("INVOICE", RIGHT, y, { size: 20, bold: true, align: "right" });
  y += 6;
  const contact = [company.phone, company.email].filter(Boolean).join("  |  ");
  const headLines = [
    ...doc.splitTextToSize(company.address || "", 95),
    ...(contact ? [contact] : []),
    ...(company.npwp ? [`NPWP ${company.npwp}`] : []),
  ] as string[];
  headLines.forEach((line, index) => text(line, MARGIN_X, y + index * 4.5, { size: 9, color: MUTED }));
  text(invoice.invoiceNumber, RIGHT, y, { size: 11, bold: true, align: "right" });
  text(invoiceStatusLabel(invoice.status), RIGHT, y + 5, { size: 9, color: MUTED, align: "right" });
  y += Math.max(headLines.length * 4.5, 10) + 6;
  rule(y);
  y += 8;

  const meta: [string, string][] = [
    ["Ditagihkan kepada", invoice.customerName],
    ["Tanggal invoice", invoice.date],
    ["Jatuh tempo", invoice.dueDate || "-"],
  ];
  meta.forEach(([label, value], index) => {
    const x = MARGIN_X + index * 62;
    text(label.toUpperCase(), x, y, { size: 7.5, bold: true, color: MUTED });
    const wrapped = doc.splitTextToSize(value, 58) as string[];
    wrapped.slice(0, 2).forEach((line, row) => text(line, x, y + 5 + row * 4.5, { size: 10.5, bold: true }));
  });
  if (restaurant?.address) {
    const wrapped = doc.splitTextToSize(restaurant.address, 58) as string[];
    wrapped.slice(0, 2).forEach((line, row) => text(line, MARGIN_X, y + 14 + row * 4, { size: 8.5, color: MUTED }));
  }
  y += 24;

  const columns = [
    { title: "Produk", x: MARGIN_X, align: "left" as const },
    { title: "Ukuran", x: 78, align: "left" as const },
    { title: "Qty", x: 108, align: "right" as const },
    { title: "Margin", x: 127, align: "right" as const },
    { title: "Satuan", x: 131, align: "left" as const },
    { title: "Harga", x: 168, align: "right" as const },
    { title: "Subtotal", x: RIGHT, align: "right" as const },
  ];
  const header = () => {
    doc.setFillColor(...ACCENT);
    doc.roundedRect(MARGIN_X, y - 5, RIGHT - MARGIN_X, 8, 1.5, 1.5, "F");
    columns.forEach((column) => text(column.title, column.x + (column.align === "left" ? 2 : column.x === RIGHT ? -2 : 0), y, { size: 8.5, bold: true, align: column.align, color: [255, 255, 255] }));
    y += 8;
  };
  header();

  const rows = rowsOf(invoice, business);
  if (rows.length === 0) {
    text("Rincian produk belum tersedia pada invoice lama ini.", MARGIN_X + 2, y + 2, { size: 9, color: MUTED });
    y += 10;
  }
  for (const row of rows) {
    const nameLines = doc.splitTextToSize(row.name, 58) as string[];
    const height = Math.max(nameLines.length * 4.5, 6) + 3;
    if (y + height > PAGE_H - 50) {
      doc.addPage();
      y = 20;
      header();
    }
    nameLines.forEach((line, index) => text(line, MARGIN_X + 2, y + index * 4.5, { size: 9.5, bold: true }));
    text(row.size, 78 + 2, y, { size: 9 });
    text(row.qty, 108, y, { size: 9, align: "right" });
    text(row.margin, 127, y, { size: 9, align: "right" });
    text(row.unit, 131 + 2, y, { size: 9 });
    text(row.price, 168, y, { size: 9, align: "right" });
    text(row.subtotal, RIGHT - 2, y, { size: 9, bold: true, align: "right" });
    y += height - 1;
    rule(y);
    y += 5;
  }

  const scaleMargin = invoiceScaleMargin(invoice);
  const totals: [string, string, boolean?][] = [
    ["Subtotal", money(invoice.subtotal)],
    ["Diskon", invoice.discount > 0 ? `- ${money(invoice.discount)}` : money(0)],
    ...(scaleMargin > 0 ? ([["Total tonjolan bobot", money(scaleMargin)]] as [string, string][]) : []),
    ["Total tagihan", money(invoice.total), true],
    ["Sudah dibayar", money(invoice.paidAmount)],
    ["Sisa tagihan", money(invoice.outstandingAmount), true],
  ];
  const needed = totals.length * 7 + 40;
  if (y + needed > PAGE_H - 15) {
    doc.addPage();
    y = 20;
  }
  y += 3;
  for (const [label, value, strong] of totals) {
    if (strong) {
      doc.setFillColor(238, 242, 250);
      doc.roundedRect(118, y - 5, RIGHT - 118, 8, 1.5, 1.5, "F");
    }
    text(label, 121, y, { size: strong ? 10.5 : 9.5, bold: !!strong, color: strong ? ACCENT : MUTED });
    text(value, RIGHT - 2, y, { size: strong ? 10.5 : 9.5, bold: !!strong, align: "right", color: strong ? ACCENT : INK });
    y += 8;
  }

  if (invoice.outstandingAmount > 0 && company.bankAccount) {
    y += 6;
    rule(y);
    y += 7;
    text("PEMBAYARAN TRANSFER", MARGIN_X, y, { size: 7.5, bold: true, color: MUTED });
    text(`${company.bankName} ${company.bankAccount}`, MARGIN_X, y + 6, { size: 11, bold: true });
    if (company.bankHolder) text(`a.n. ${company.bankHolder}`, MARGIN_X, y + 11, { size: 9, color: MUTED });
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    text(`${company.name}  |  ${invoice.invoiceNumber}  |  Halaman ${page}/${pages}`, PAGE_W / 2, PAGE_H - 8, { size: 7.5, color: MUTED, align: "center" });
  }
  return doc;
}

export async function downloadInvoicePdf(invoice: Invoice, business: BusinessState) {
  const doc = await buildInvoicePdf(invoice, business);
  doc.save(invoiceFileName(invoice));
}
