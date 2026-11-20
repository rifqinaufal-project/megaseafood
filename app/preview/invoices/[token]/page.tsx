import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getSql } from "@/src/infrastructure/server/db";
import { publicInvoice } from "@/src/domain/public-invoice";
import { formatRupiah, type BusinessState, type Invoice } from "@/src/domain/business-state";
import PrintButton from "./print-button";

export const metadata = { title: "Invoice Digital — Mega Seafood", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export const instant = false;
const money = (value: number) => `Rp ${formatRupiah(value)}`;

export default async function InvoicePreview({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  const sql = await getSql();
  const rows = await sql`
    SELECT i AS invoice, s.data->'company' AS company, s.data->'products' AS products
    FROM invoice_public_links l JOIN shared_business_state s ON s.id = 1
    CROSS JOIN LATERAL jsonb_array_elements(s.data->'invoices') i
    WHERE l.token = ${token} AND i->>'id' = l.invoice_id LIMIT 1`;
  if (!rows[0]) notFound();
  const invoice = publicInvoice(rows[0].invoice as Invoice, rows[0].company as BusinessState["company"], (rows[0].products ?? []) as BusinessState["products"]);
  const status = invoice.outstandingAmount <= 0 ? "Lunas" : invoice.paidAmount > 0 ? "Dibayar sebagian" : "Belum lunas";
  return <main className="public-invoice-page">
    <div className="public-invoice-wrap">
      <div className="public-invoice-toolbar"><div><strong>Invoice digital</strong><p>Rincian tagihan Anda</p></div><PrintButton /></div>
      <article className="public-invoice-sheet">
        <header className="public-invoice-head"><div><span className="public-invoice-label">INVOICE</span><h1>{invoice.company.name}</h1><p>{invoice.company.address}</p><p>{[invoice.company.phone, invoice.company.email].filter(Boolean).join(" · ")}</p></div><span className="public-invoice-status">{status}</span></header>
        <section className="public-invoice-meta"><div><small>Ditagihkan kepada</small><strong>{invoice.customerName}</strong></div><div><small>Nomor invoice</small><strong>{invoice.invoiceNumber}</strong></div><div><small>Tanggal</small><strong>{invoice.date}</strong></div><div><small>Jatuh tempo</small><strong>{invoice.dueDate || "—"}</strong></div></section>
        <div className="public-invoice-table"><table><thead><tr><th>Produk</th><th>Jumlah</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody>{invoice.items.map((item, index) => <tr key={index}><td>{item.name}</td><td>{item.quantity} {item.unit}</td><td>{money(item.price)}</td><td>{money(item.subtotal)}</td></tr>)}</tbody></table></div>
        <section className="public-invoice-totals"><div><span>Subtotal</span><strong>{money(invoice.subtotal)}</strong></div>{invoice.discount > 0 && <div><span>Diskon</span><strong>− {money(invoice.discount)}</strong></div>}<div><span>Total</span><strong>{money(invoice.total)}</strong></div><div><span>Sudah dibayar</span><strong>{money(invoice.paidAmount)}</strong></div><div className="public-invoice-due"><span>Sisa tagihan</span><strong>{money(invoice.outstandingAmount)}</strong></div></section>
        {invoice.company.bankAccount && <section className="public-invoice-bank"><small>INFORMASI PEMBAYARAN</small><strong>{invoice.company.bankName} · {invoice.company.bankAccount}</strong><p>{invoice.company.bankHolder && `a.n. ${invoice.company.bankHolder}`}</p></section>}
        <p className="public-invoice-thanks">Terima kasih atas kepercayaan Anda.</p>
      </article>
    </div>
  </main>;
}
