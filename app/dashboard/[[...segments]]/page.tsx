import AuthGate from "@/src/presentation/auth/AuthGate";
import DashboardShell from "@/src/presentation/dashboard/DashboardShell";

export default async function DashboardRoute({
  params,
}: {
  params: Promise<{ segments?: string[] }>;
}) {
  await params;

  return (
    <AuthGate>
      <DashboardShell />
    </AuthGate>
  );
}
