import AuthGate from "@/src/presentation/auth/AuthGate";
import DashboardShell from "@/src/presentation/dashboard/DashboardShell";

export default function Home() {
  return (
    <AuthGate>
      <DashboardShell />
    </AuthGate>
  );
}
