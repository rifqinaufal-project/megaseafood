import type { DashboardSnapshot } from "@/src/domain/dashboard";

export interface DashboardRepository {
  getSnapshot(): DashboardSnapshot;
}
