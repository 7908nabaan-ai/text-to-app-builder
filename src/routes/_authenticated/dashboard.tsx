import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/orders";
import { AdminHome, CustomerActions, OwnerHome } from "@/components/role-home";
import { CustomerOrder } from "@/components/customer-order";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Home — Sky Plus" },
      { name: "description", content: "Your current container order, capacity and totals." },
      { property: "og:title", content: "Home — Sky Plus" },
      { property: "og:description", content: "Your current container order, capacity and totals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <Page title="Home">
      {({ accountType, userId }) =>
        accountType === "customer" ? (
          <div className="space-y-6">
            <CustomerOrder userId={userId} />
            <div className="space-y-3">
              <h2 className="font-display text-lg font-bold">Quick links</h2>
              <CustomerActions />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {accountType === "owner" ? <OwnerHome /> : <AdminHome />}
            <div className="space-y-3">
              <h2 className="font-display text-lg font-bold">Latest orders</h2>
              <StaffOrders />
            </div>
          </div>
        )
      }
    </Page>
  );
}

function StaffOrders() {
  const { data = [] } = useQuery({
    queryKey: ["staff-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const ids = [...new Set(data.map((o) => o.customer_id))];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, company_name, contact_name").in("id", ids)
        : { data: [] };
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return data.map((o) => ({ ...o, profiles: map.get(o.customer_id) ?? null }));
    },
  });

  if (data.length === 0) {
    return <EmptyState title="No orders yet" description="Customer orders will show up here." />;
  }

  return (
    <div className="space-y-3">
      {data.map((order) => {
        const profile = (order as unknown as { profiles?: { company_name: string | null; contact_name: string | null } | null }).profiles;
        return (
          <Link key={order.id} to="/staff/orders/$orderId" params={{ orderId: order.id }}>
            <Card className="transition-colors hover:border-accent">
              <CardContent className="flex items-center justify-between gap-3 pt-5">
                <div>
                  <p className="font-medium">{order.order_number}</p>
                  <p className="text-sm text-muted-foreground">
                    {profile?.company_name || profile?.contact_name || "Customer"}
                  </p>
                </div>
                <Badge>{STATUS_LABELS[order.status] ?? order.status}</Badge>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

