"use client";

import { Suspense, useCallback, useRef, useState, type ReactNode } from "react";
import { RoutedSidebar } from "@/src/shell/Sidebar";
import { TopBar } from "@/src/shell/TopBar";
import { setSidebarCollapsed, useSidebarCollapsed } from "@/src/shell/sidebar-state";
import { useDismiss } from "@/src/shell/use-dismiss";

type SidebarSlotProps = {
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
};

// usePathname butuh Suspense saat prerender (cacheComponents). Fallback menjaga lebar sidebar.
function SidebarSlot(props: SidebarSlotProps) {
  return (
    <Suspense fallback={<div className={props.collapsed ? "h-full w-[76px] bg-surface" : "h-full w-[264px] bg-surface"} />}>
      <RoutedSidebar {...props} />
    </Suspense>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const collapsed = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useDismiss(drawer, drawerOpen, closeDrawer);

  return (
    <div className="flex min-h-dvh bg-bg text-text">
      <aside className="sticky top-0 hidden h-dvh shrink-0 border-r border-border md:block">
        <SidebarSlot collapsed={collapsed} onToggleCollapsed={() => setSidebarCollapsed(!collapsed)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMenu={() => setDrawerOpen(true)} />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-12 pt-2 md:px-8">{children}</main>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-text/30" aria-hidden />
          <div ref={drawer} role="dialog" aria-modal="true" aria-label="Menu" className="absolute inset-y-0 left-0 shadow-sm">
            <SidebarSlot collapsed={false} onNavigate={closeDrawer} />
          </div>
        </div>
      )}
    </div>
  );
}
