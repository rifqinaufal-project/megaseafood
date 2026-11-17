import { formatRupiah, type BusinessState, type Invoice } from "@/src/domain/business-state";

const money = (value: number) => `Rp ${formatRupiah(value)}`;

/** Normalisasi nomor lokal Indonesia ke format internasional tanpa "+" untuk wa.me. */
export function whatsappNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  return /^62\d{8,13}$/.test(digits) ? digits : null;
}

export function invoiceRestaurant(invoice: Invoice, business: BusinessState) {
  return business.restaurants.find((item) => item.id === invoice.restaurantId);
}

export function invoiceWhatsappMessage(invoice: Invoice, business: BusinessState): string {
  const { company } = business;
  const restaurant = invoiceRestaurant(invoice, business);
  const lines = [
    `Halo ${restaurant?.contactName || invoice.customerName},`,
    "",
    `Berikut tagihan dari ${company.name} untuk ${invoice.customerName}:`,
    `Invoice: ${invoice.invoiceNumber}`,
    `Tanggal: ${invoice.date}`,
    invoice.dueDate ? `Jatuh tempo: ${invoice.dueDate}` : "",
    `Total tagihan: ${money(invoice.total)}`,
    invoice.paidAmount > 0 ? `Sudah dibayar: ${money(invoice.paidAmount)}` : "",
    invoice.outstandingAmount > 0 ? `Sisa tagihan: ${money(invoice.outstandingAmount)}` : "Status: Lunas",
  ];
  if (invoice.outstandingAmount > 0 && company.bankAccount)
    lines.push("", `Pembayaran transfer ke ${company.bankName} ${company.bankAccount}${company.bankHolder ? ` a.n. ${company.bankHolder}` : ""}.`);
  lines.push("", "Terima kasih.");
  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
}

export type WhatsappLink = { ok: true; url: string } | { ok: false; message: string };

export function invoiceWhatsappLink(invoice: Invoice, business: BusinessState): WhatsappLink {
  const restaurant = invoiceRestaurant(invoice, business);
  if (!restaurant) return { ok: false, message: "Restoran invoice ini tidak ditemukan, nomor WhatsApp tidak tersedia" };
  if (!restaurant.phone.trim()) return { ok: false, message: `Nomor telepon ${restaurant.name} belum diisi di menu Restoran` };
  const number = whatsappNumber(restaurant.phone);
  if (!number) return { ok: false, message: `Nomor ${restaurant.name} (${restaurant.phone}) tidak valid untuk WhatsApp` };
  return { ok: true, url: `https://wa.me/${number}?text=${encodeURIComponent(invoiceWhatsappMessage(invoice, business))}` };
}
