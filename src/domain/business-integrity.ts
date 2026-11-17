import type { BusinessState, Receipt } from "@/src/domain/business-state";

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Calendar arithmetic deliberately uses UTC throughout, never local-to-UTC conversion.
export function addCalendarDays(value: string, days: number): string {
  if (!isBusinessDate(value) || !Number.isSafeInteger(days) || days < 0) {
    throw new Error("Tanggal atau termin pembayaran tidak valid");
  }
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function reserveDocumentNumber(state: BusinessState, prefix: string, width: number) {
  const existing = [
    ...state.batches.map((item) => item.batchNumber),
    ...state.receipts.map((item) => item.receiptNumber),
    ...state.invoices.map((item) => item.invoiceNumber),
  ];
  const maximum = existing.reduce((max, number) => {
    if (!number.startsWith(prefix)) return max;
    const suffix = number.slice(prefix.length);
    return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
  }, state.numberSequences?.[prefix] ?? 0);
  const sequence = maximum + 1;
  if (!Number.isSafeInteger(sequence)) throw new Error("Nomor transaksi melampaui batas");
  return {
    number: `${prefix}${String(sequence).padStart(width, "0")}`,
    numberSequences: { ...state.numberSequences, [prefix]: sequence },
  };
}

// Persist high-water marks before a record can be deleted or moved to another date.
export function retainDocumentSequences(state: BusinessState): BusinessState {
  const numberSequences = { ...state.numberSequences };
  const numbers = [
    ...state.batches.map((item) => item.batchNumber),
    ...state.receipts.map((item) => item.receiptNumber),
    ...state.invoices.map((item) => item.invoiceNumber),
  ];
  for (const number of numbers) {
    const match = /^(BAT-\d{6}-|(?:INV|RCV)\/\d{4}\/\d{2}\/)(\d+)$/.exec(number);
    if (match) numberSequences[match[1]] = Math.max(numberSequences[match[1]] ?? 0, Number(match[2]));
  }
  return { ...state, numberSequences };
}

export function receiptOutstanding(receipt: Receipt): number | null {
  if (receipt.status === "CANCELLED") return 0;
  return receipt.paidAmount === undefined ? null : receipt.subtotal - receipt.paidAmount;
}
