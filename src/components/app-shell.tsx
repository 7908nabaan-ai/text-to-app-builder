import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Bell,
  Boxes,
  ClipboardList,
  FileText,
  History,
  LayoutGrid,
  LogOut,
  Package,
  Settings,
  Ship,
  ShoppingCart,
  Tags,
  UserRound,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof Ship };

const customerNav: NavItem[] = [
  { to: "/dashboard", label: "Order", icon: ClipboardList },
  { to: "/catalog", label: "Catalog", icon: LayoutGrid },
  { to: "/history", label: "History", icon: History },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/profile", label: "Profile", icon: UserRound },
];

const staffNav: NavItem[] = [
  { to: "/dashboard", label: "Orders", icon: ShoppingCart },
  { to: "/staff/customers", label: "Customers", icon: Users },
  { to: "/staff/products", label: "Products", icon: Package },
  { to: "/staff/categories", label: "Categories", icon: Tags },
  { to: "/staff/settings", label: "Settings", icon: Settings },
];

const secondaryNav: NavItem[] = [
  { to: "/reports", label: "Reports", icon: Boxes },
  { to: "/notifications", label: "Notifications", icon: Bell },
];

export function AppShell({
  children,
  isStaff,
  title,
}: {
  children: ReactNode;
  isStaff: boolean;
  title?: string;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const primary = isStaff ? staffNav : customerNav;
  const items = [...primary, ...secondaryNav];

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <Ship className="h-5 w-5 text-sidebar-primary" />
            <span className="font-display text-lg font-bold tracking-wide">SKY PLUS</span>
          </Link>
          {title && (
            <span className="ml-1 truncate text-sm text-sidebar-foreground/70">{title}</span>
          )}
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  pathname.startsWith(item.to) && "bg-sidebar-accent text-sidebar-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            aria-label="Sign out"
            className="ml-auto text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground md:ml-0"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card md:hidden">
        <div className="grid grid-cols-5">
          {primary.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium text-muted-foreground",
                  active && "text-primary",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
