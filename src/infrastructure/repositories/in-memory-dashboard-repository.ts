import type { DashboardRepository } from "@/src/application/ports/dashboard-repository";
import type { DashboardSnapshot } from "@/src/domain/dashboard";

const snapshot: DashboardSnapshot = {
  stats: [
    { label: "Profit gabungan", value: "Rp 78,4 jt", change: "+12,8%", detail: "dibanding bulan lalu", tone: "primary", iconKey: "wallet" },
    { label: "Profit Lapak", value: "Rp 31,8 jt", change: "+8,2%", detail: "dari 12 batch", tone: "soft", iconKey: "lapak" },
    { label: "Profit Resto & Online", value: "Rp 46,6 jt", change: "+16,4%", detail: "dari 48 pesanan", tone: "soft", iconKey: "resto" },
    { label: "Piutang berjalan", value: "Rp 28,5 jt", change: "3 invoice", detail: "perlu ditindaklanjuti", tone: "warning", iconKey: "receivable" },
  ],
  activities: [
    { id: "INV-00128", activity: "Pesanan Restoran · Dapoer Ikan", amount: "Rp 8.750.000", status: "Lunas", date: "Hari ini, 09:42" },
    { id: "BAT-100626-001", activity: "Batch Lapak · Pasar Muara Baru", amount: "Rp 12.400.000", status: "Berjalan", date: "Hari ini, 08:18" },
    { id: "INV-00127", activity: "Pesanan Online · WhatsApp", amount: "Rp 2.180.000", status: "Diproses", date: "Kemarin, 16:30" },
    { id: "RCV-00054", activity: "Penerimaan stok · CV Laut Jaya", amount: "Rp 18.900.000", status: "Selesai", date: "Kemarin, 13:05" },
    { id: "EXP-00081", activity: "Biaya operasional · Es & kemasan", amount: "Rp 640.000", status: "Tercatat", date: "10 Jun, 11:20" },
  ],
  chartValues: {
    overview: [48, 58, 52, 68, 62, 88, 74, 94],
    lapak: [42, 61, 52, 70, 58, 86, 74, 92],
    resto: [55, 66, 76, 64, 82, 73, 91, 78],
  },
  costs: [28, 35, 26, 39, 31, 46, 36, 42],
  chartTotal: "Rp 78.420.000",
  chartChange: "12,8%",
  cashTotal: "Rp 186.450.000",
  cashChange: "5,6% bulan ini",
  wallets: [
    { name: "Rekening operasional", description: "Bank BCA · **** 8281", amount: "Rp 112,8 jt", tone: "navy" },
    { name: "Kas Lapak", description: "Saldo tersedia", amount: "Rp 42,6 jt", tone: "blue" },
    { name: "Kas Online", description: "Saldo tersedia", amount: "Rp 31 jt", tone: "mist" },
  ],
};

export class InMemoryDashboardRepository implements DashboardRepository {
  getSnapshot(): DashboardSnapshot {
    return snapshot;
  }
}
