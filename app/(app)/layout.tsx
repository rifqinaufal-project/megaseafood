import type { ReactNode } from "react";
import AuthGate from "@/src/presentation/auth/AuthGate";
import { BusinessProvider } from "@/src/shell/business-provider";
import { ThemeProvider } from "@/src/shell/theme-provider";
import { ToastProvider } from "@/src/ui/toast";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthGate>
        <BusinessProvider>
          <ToastProvider>{children}</ToastProvider>
        </BusinessProvider>
      </AuthGate>
    </ThemeProvider>
  );
}
