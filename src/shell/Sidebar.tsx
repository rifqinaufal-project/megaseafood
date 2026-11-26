"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fish, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { BusinessSwitcher } from "@/src/shell/BusinessSwitcher";
import { businessFromPath, businesses, isNavItemActive, settingsHref, type NavItem } from "@/src/shell/nav";

type SidebarProps = {
  pathname: string;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
};

export function Sidebar({ pathname, collapsed, onToggleCollapsed, onNavigate }: SidebarProps) {
  const active = businessFromPath(pathname) ?? businesses[0];
  const settingsActive = pathname === settingsHref;

  return (
    <div className={`flex h-full flex-col gap-6 bg-surface p-4 ${collapsed ? "w-[76px]" : "w-[264px]"}`}>
      <Link href="/" onClick={onNavigate} className={`flex h-10 items-center gap-3 px-1 text-text ${collapsed ? "justify-center" : ""}`}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg">
          <Fish size={18} strokeWidth={1.75} aria-hidden />
        </span>
        {!collapsed && <span className="text-base font-semibold tracking-tight">megaseafood</span>}
      </Link>

      <BusinessSwitcher active={active} collapsed={collapsed} onNavigate={onNavigate} />

      <nav aria-label={`Menu ${active.name}`} className="flex flex-1 flex-col gap-1">
        {active.items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isNavItemActive(item, pathname)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="flex flex-col gap-1">
        <NavLink
          item={{ label: "Pengaturan", href: settingsHref, icon: Settings }}
          active={settingsActive}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Buka sidebar" : "Lipat sidebar"}
            className={`group relative flex h-10 items-center gap-3 rounded-full px-3 text-sm font-medium text-text-muted hover:bg-surface-2 hover:text-text ${
              collapsed ? "justify-center" : ""
            }`}
          >
            {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden /> : <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden />}
            {!collapsed && <span>Lipat menu</span>}
          </button>
        )}
      </div>
    </div>
  );
}

type NavLinkProps = {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
};

function NavLink({ item, active, collapsed, onNavigate }: NavLinkProps) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={`group relative flex h-10 items-center gap-3 rounded-full px-3 text-sm font-medium transition-colors ${
        collapsed ? "justify-center" : ""
      } ${active ? "bg-primary text-primary-fg" : "text-text-muted hover:bg-surface-2 hover:text-text"}`}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden className="shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-full bg-text px-3 py-1 text-xs text-bg opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {item.label}
        </span>
      )}
    </Link>
  );
}

export function RoutedSidebar(props: Omit<SidebarProps, "pathname">) {
  const pathname = usePathname();
  return <Sidebar pathname={pathname} {...props} />;
}
