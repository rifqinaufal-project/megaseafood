export type Module = "overview" | "lapak" | "resto";

export type StatTone = "primary" | "soft" | "warning";

export type ActivityStatus = "Lunas" | "Belum lunas" | "Berjalan" | "Selesai" | "Tercatat";

export type OverviewRange = "Bulan ini" | "Kuartal ini" | "Tahun ini";

export interface DashboardStat {
  label: string;
  value: string;
  change: string;
  detail: string;
  tone: StatTone;
  iconKey: "wallet" | "lapak" | "resto" | "receivable";
}

export interface ActivityRow {
  id: string;
  activity: string;
  amount: string;
  status: ActivityStatus;
  date: string;
}

export interface WalletSummary {
  name: string;
  description: string;
  amount: string;
  tone: "navy" | "blue" | "mist";
}

export interface DashboardSnapshot {
  stats: DashboardStat[];
  activities: ActivityRow[];
  chart: {
    labels: string[];
    profit: number[];
    cost: number[];
    hasData: boolean;
    total: string;
    change: string | null;
  };
  cashTotal: string;
  cashNote: string;
  wallets: WalletSummary[];
}
