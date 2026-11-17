import type { DashboardRepository } from "@/src/application/ports/dashboard-repository";
import type { DashboardSnapshot } from "@/src/domain/dashboard";

export function getDashboardSnapshot(repository: DashboardRepository): DashboardSnapshot {
  return repository.getSnapshot();
}
