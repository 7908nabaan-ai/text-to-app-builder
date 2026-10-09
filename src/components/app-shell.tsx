import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { BarChart3, Heart, Home, LifeBuoy, MessageCircle, Wallet, Bell, Boxes, ClipboardList, FileText, History, LayoutGrid, LogOut, Package, Search, Send, Settings, Ship, ShoppingCart, Tags, UserRound, Users, Menu, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import shippingImage from "@/assets/hero-containers.jpg";

type NavItem = { to: string; label: string; icon: typeof Ship };
const customerNav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/catalog", label: "Order & catalogue", icon: ShoppingCart },
  { to: "/orders", label: "My orders", icon: ClipboardList },
  { to: "/history", label: "Order history", icon: History },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/payments", label: "Payments & balance", icon: Wallet },
  { to: "/favourites", label: "Favourites", icon: Heart },
  { to: "/messages", label: "Messages", icon: MessageCircle },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/profile", label: "My profile", icon: UserRound },
  { to: "/support", label: "Help & support", icon: LifeBuoy },
];
const staffNav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/staff/orders", label: "Orders", icon: ClipboardList },
  { to: "/staff/customers", label: "Customers", icon: Users },
  { to: "/staff/products", label: "Products", icon: Package },
  { to: "/staff/import", label: "Import catalogue", icon: Boxes },
  { to: "/staff/categories", label: "Categories", icon: Tags },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/history", label: "History", icon: History },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/messages", label: "Messages", icon: MessageCircle },
  { to: "/staff/invites", label: "Invites", icon: Send },
  { to: "/staff/settings", label: "Settings", icon: Settings },
  { to: "/notifications", label: "Notifications", icon: Bell },
];

export function AppShell({ children, isStaff, title }: { children: ReactNode; isStaff: boolean; title?: string }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const primary = isStaff ? staffNav : customerNav;
  const queryClient = useQueryClient();
  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  const searchCatalog = (event: React.FormEvent) => {
    event.preventDefault();
    void navigate({ to: isStaff ? "/staff/products" : "/catalog" });
  };
  return (
    <div className="workspace min-h-screen bg-background">
      <header className="workspace-header sticky top-0 z-40 flex h-16 items-center border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex w-auto shrink-0 items-center gap-1 px-3 lg:w-56">
          <BackButton fallback="/dashboard" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" />
          <Link to="/dashboard" className="leading-none">
            <span className="font-display text-2xl font-bold italic">SKY<span className="text-sidebar-primary"> PLUS</span></span>
            <span className="mt-1 block text-[8px] tracking-normal text-sidebar-foreground/70">YOUR GLOBAL FMCG PARTNER</span>
          </Link>
        </div>
        <form onSubmit={searchCatalog} className="relative ml-3 hidden max-w-xl flex-1 sm:block">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Open product catalogue" placeholder="Browse products, brands and categories…" readOnly onClick={() => void navigate({ to: isStaff ? "/staff/products" : "/catalog" })} value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 cursor-pointer border-0 bg-card pl-10 text-card-foreground" />
        </form>
        <div className="ml-auto flex items-center gap-1 px-3 sm:gap-3">
          <Link to="/dashboard" className="hidden items-center gap-2 text-sm md:flex"><Ship className="h-4 w-4" />Home</Link>
          <Link to="/notifications" aria-label="Notifications" className="rounded-md p-2 hover:bg-sidebar-accent"><Bell className="h-4 w-4" /></Link>
          <span className="hidden items-center gap-2 text-sm xl:flex"><UserRound className="h-7 w-7 rounded-full bg-sidebar-accent p-1.5" />{isStaff ? "Staff account" : "Customer account"}</span>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" title="Sign out" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"><LogOut /></Button>
          <Button variant="ghost" size="icon" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(!menuOpen)} className="text-sidebar-foreground hover:bg-sidebar-accent lg:hidden">{menuOpen ? <X /> : <Menu />}</Button>
        </div>
      </header>
      {menuOpen && <div className="fixed inset-0 top-16 z-30 bg-foreground/40 lg:hidden" onClick={() => setMenuOpen(false)} />}
      <aside className={cn("workspace-sidebar fixed bottom-0 left-0 top-16 z-30 flex w-56 flex-col overflow-y-auto bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0", menuOpen ? "translate-x-0" : "-translate-x-full")}>
        <nav className="py-5" aria-label="Main navigation">
          {primary.map((item) => {
            const Icon = item.icon;
            return <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={cn("flex min-h-11 items-center gap-3 border-l-3 border-transparent px-5 py-3 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground", (pathname === item.to || pathname.startsWith(item.to + "/")) && "border-sidebar-primary bg-sidebar-accent text-sidebar-foreground")}><Icon className="h-4 w-4 shrink-0" />{item.label}</Link>;
          })}
        </nav>
        <div className="relative mt-auto min-h-64 overflow-hidden">
          <img src={shippingImage} alt="Container shipping" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-40" />
          <div className="relative px-6 py-8"><Ship className="mb-4 h-8 w-8 text-sidebar-primary" /><p className="text-sm leading-relaxed">Good products.<br /><strong>Better business.<br />Together.</strong></p></div>
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-5 lg:ml-56 lg:p-6">{title && <span className="sr-only">{title}</span>}{children}</main>
    </div>
  );
}
