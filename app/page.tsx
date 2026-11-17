import { getDashboardSnapshot } from "@/src/application/use-cases/get-dashboard";
import { InMemoryDashboardRepository } from "@/src/infrastructure/repositories/in-memory-dashboard-repository";
import AuthGate from "@/src/presentation/auth/AuthGate";
import DashboardShell from "@/src/presentation/dashboard/DashboardShell";

const dashboardRepository = new InMemoryDashboardRepository();

export default function Home() {
  const dashboard = getDashboardSnapshot(dashboardRepository);

  return (
    <AuthGate>
      <DashboardShell dashboard={dashboard} />
    </AuthGate>
  );
}
