import AuthGate from "@/src/presentation/auth/AuthGate";
import DashboardShell from "@/src/presentation/dashboard/DashboardShell";
import { notFound, redirect } from "next/navigation";
import { resolveDashboardRoute } from "@/src/presentation/dashboard/workspace-routing";

export default async function DashboardRoute({
  params,
}: {
  params: Promise<{ segments?: string[] }>;
}) {
  const route = resolveDashboardRoute((await params).segments);
  if (!route) notFound();
  if (!route.isCanonical) redirect(route.canonicalPath);

  return (
    <AuthGate>
      <DashboardShell />
    </AuthGate>
  );
}
