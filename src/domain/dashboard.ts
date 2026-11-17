export type Module = "overview" | "lapak" | "resto";

export type StatTone = "primary" | "soft" | "warning";

export type ActivityStatus = "Lunas" | "Berjalan" | "Diproses" | "Selesai" | "Tercatat";

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
  chartValues: Record<Module, number[]>;
  costs: number[];
  chartTotal: string;
  chartChange: string;
  cashTotal: string;
  cashChange: string;
  wallets: WalletSummary[];
}
