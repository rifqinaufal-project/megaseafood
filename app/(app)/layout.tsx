import type { ReactNode } from "react";
import AuthGate from "@/src/presentation/auth/AuthGate";
import { AppShell } from "@/src/shell/AppShell";
import { BusinessProvider } from "@/src/shell/business-provider";
import { ThemeProvider } from "@/src/shell/theme-provider";
import { ToastProvider } from "@/src/ui/toast";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthGate>
        <BusinessProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </BusinessProvider>
      </AuthGate>
    </ThemeProvider>
  );
}
