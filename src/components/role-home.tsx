import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, ClipboardCheck, FileText, History, LayoutGrid, Package, Send, Settings, ShieldCheck, Sparkles, Truck, Upload, Users, Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/calc";

type Action = { to: string; label: string; hint: string; icon: typeof Package };

function ActionGrid({ actions }: { actions: Action[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <Link key={a.to + a.label} to={a.to}>
            <Card className="h-full transition-colors hover:border-gold">
              <CardContent className="space-y-1 pt-5">
                <Icon className="h-5 w-5 text-gold" />
                <p className="font-medium">{a.label}</p>
                <p className="text-xs text-muted-foreground">{a.hint}</p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="stat-label">{label}</p>
        <p className="font-display text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function useStaffStats(withMoney: boolean) {
  return useQuery({
    queryKey: ["staff-home-stats", withMoney],
    queryFn: async () => {
      const [orders, customers, products, invites, payments] = await Promise.all([
        supabase.from("orders").select("status"),
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "customer"),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("customer_invites").select("id", { count: "exact", head: true }).is("accepted_at", null).is("revoked_at", null),
        withMoney ? supabase.from("payments").select("amount, status") : Promise.resolve({ data: [] as { amount: number; status: string }[] }),
      ]);
      const list = orders.data ?? [];
      const count = (s: string[]) => list.filter((o) => s.includes(o.status)).length;
      return {
        toReview: count(["submitted", "under_review"]),
        waiting: count(["awaiting_customer"]),
        inTransit: count(["confirmed", "loading", "shipped"]),
        customers: customers.count ?? 0,
        products: products.count ?? 0,
        invites: invites.count ?? 0,
        received: (payments.data ?? []).filter((p) => p.status !== "void").reduce((s, p) => s + Number(p.amount), 0),
      };
    },
  });
}

export function OwnerHome() {
  const { data } = useStaffStats(true);
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-gold" />Owner — full control of the business, team and settings.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Orders to review" value={data?.toReview ?? "–"} />
        <Stat label="In progress / shipping" value={data?.inTransit ?? "–"} />
        <Stat label="Customers" value={data?.customers ?? "–"} />
        <Stat label="Payments received" value={data ? formatMoney(data.received) : "–"} />
      </div>
      <ActionGrid
        actions={[
          { to: "/reports", label: "Reports", hint: "Sales and exports", icon: BarChart3 },
          { to: "/staff/invites", label: "Invite team & customers", hint: "Owners, Admins, Customers", icon: Send },
          { to: "/staff/settings", label: "Business settings", hint: "Contacts, bank, containers", icon: Settings },
          { to: "/staff/customers", label: "Customers", hint: "Accounts and balances", icon: Users },
          { to: "/staff/products", label: "Products", hint: `${data?.products ?? "–"} active`, icon: Package },
          { to: "/staff/import", label: "Import price list", hint: "Excel, ZIP or AI reader", icon: Upload },
        ]}
      />
    </div>
  );
}

export function AdminHome() {
  const { data } = useStaffStats(false);
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><ClipboardCheck className="h-4 w-4 text-gold" />Admin — handle orders, catalog and customers day to day.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Orders to review" value={data?.toReview ?? "–"} />
        <Stat label="Waiting on customer" value={data?.waiting ?? "–"} />
        <Stat label="Loading / shipping" value={data?.inTransit ?? "–"} />
        <Stat label="Open invites" value={data?.invites ?? "–"} />
      </div>
      <ActionGrid
        actions={[
          { to: "/staff/products", label: "Products", hint: `${data?.products ?? "–"} active`, icon: Package },
          { to: "/staff/import", label: "Import price list", hint: "Excel, ZIP or AI reader", icon: Sparkles },
          { to: "/staff/customers", label: "Customers", hint: "Accounts and orders", icon: Users },
          { to: "/staff/invites", label: "Invite customers", hint: "Send sign-up links", icon: Send },
        ]}
      />
    </div>
  );
}

export function CustomerActions() {
  return (
    <ActionGrid
      actions={[
        { to: "/catalog", label: "Catalog", hint: "Browse and add products", icon: LayoutGrid },
        { to: "/history", label: "Order history", hint: "Repeat a past order", icon: History },
        { to: "/invoices", label: "Invoices & payments", hint: "Balance and documents", icon: Wallet },
        { to: "/notifications", label: "Updates", hint: "Shipping and order news", icon: Truck },
        { to: "/profile", label: "My details", hint: "Company and address", icon: FileText },
      ]}
    />
  );
}
