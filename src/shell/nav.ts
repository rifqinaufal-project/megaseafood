import { ChartColumn, FileText, LayoutDashboard, Package, Receipt, Store, Truck, UtensilsCrossed, Users, Wallet, Boxes, type LucideIcon } from "lucide-react";

export type BusinessId = "lapak" | "resto";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
};

export type Business = {
  id: BusinessId;
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  items: NavItem[];
};

export const settingsHref = "/pengaturan";

export const businesses: Business[] = [
  {
    id: "lapak",
    name: "Lapak",
    description: "Batch, komisi, dan tagihan lapak",
    href: "/lapak",
    icon: Store,
    items: [
      { label: "Dashboard", href: "/lapak", icon: LayoutDashboard, exact: true },
      { label: "Batch", href: "/lapak/batch", icon: Package },
      { label: "Tagihan", href: "/lapak/tagihan", icon: Receipt },
      { label: "Pengadaan", href: "/lapak/pengadaan", icon: Truck },
      { label: "Laporan", href: "/lapak/laporan", icon: ChartColumn },
    ],
  },
  {
    id: "resto",
    name: "Resto & Online",
    description: "Invoice restoran, stok, dan keuangan",
    href: "/resto",
    icon: UtensilsCrossed,
    items: [
      { label: "Dashboard", href: "/resto", icon: LayoutDashboard, exact: true },
      { label: "Invoice", href: "/resto/invoice", icon: FileText },
      { label: "Stok", href: "/resto/stok", icon: Boxes },
      { label: "Keuangan", href: "/resto/keuangan", icon: Wallet },
      { label: "Kontak", href: "/resto/kontak", icon: Users },
      { label: "Laporan", href: "/resto/laporan", icon: ChartColumn },
    ],
  },
];

export function businessFromPath(pathname: string): Business | null {
  return businesses.find((business) => pathname === business.href || pathname.startsWith(`${business.href}/`)) ?? null;
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  return !item.exact && pathname.startsWith(`${item.href}/`);
}
