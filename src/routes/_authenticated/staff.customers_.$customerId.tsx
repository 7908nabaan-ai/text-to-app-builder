import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/calc";
import { STATUS_LABELS, COMPLETED_STATUSES } from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/staff/customers_/$customerId")({
  head: () => ({
    meta: [
      { title: "Customer workspace — Sky Plus" },
      { name: "description", content: "Orders, shipments, invoices, payments and activity for one customer." },
      { property: "og:title", content: "Customer workspace — Sky Plus" },
      { property: "og:description", content: "Orders, shipments, invoices, payments and activity for one customer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspacePage,
});

function WorkspacePage() {
  return (
    <Page title="Customer workspace" description="Everything about this customer in one place.">
      {({ isStaff }) => (isStaff ? <Workspace /> : <EmptyState title="Staff only" description="This page is for Sky Plus staff." />)}
    </Page>
  );
}

function Workspace() {
  const { customerId } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["customer-workspace", customerId],
    queryFn: async () => {
      const [profile, orders, invoices, payments, events] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", customerId).maybeSingle(),
        supabase.from("orders").select("id, order_number, status, container_name, created_at, shipped_at, updated_at").eq("customer_id", customerId).order("created_at", { ascending: false }),
        supabase.from("invoices").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }),
        supabase.from("payments").select("*").eq("customer_id", customerId).order("paid_at", { ascending: false }),
        supabase.from("audit_log").select("*").eq("actor_id", customerId).order("created_at", { ascending: false }).limit(50),
      ]);
      return {
        profile: profile.data,
        orders: orders.data ?? [],
        invoices: invoices.data ?? [],
        payments: payments.data ?? [],
        events: events.data ?? [],
      };
    },
  });
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const { profile, orders, invoices, payments, events } = data;
  const current = invoices.filter((i) => i.state === "current");
  const billed = current.filter((i) => i.kind === "commercial").reduce((s, i) => s + Number(i.total_value), 0)
    || current.filter((i) => i.kind === "proforma").reduce((s, i) => s + Number(i.total_value), 0);
  const paid = payments.filter((p) => p.status === "confirmed").reduce((s, p) => s + Number(p.amount), 0);
  const completed = orders.filter((o) => (COMPLETED_STATUSES as readonly string[]).includes(o.status));
  const shipments = orders.filter((o) => ["loading", "shipped", "completed"].includes(o.status));
  const currency = invoices[0]?.currency ?? "USD";

  const orderList = (list: typeof orders, empty: string) =>
    list.length === 0 ? <EmptyState title={empty} description="Nothing to show yet." /> : (
      <div className="space-y-2">
        {list.map((o, i) => (
          <Link key={o.id} to="/staff/orders/$orderId" params={{ orderId: o.id }} className="flex justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
            <span><span className="list-number">{i + 1}.</span> {o.order_number} · {o.container_name ?? "Container"}</span>
            <span className="text-muted-foreground">{STATUS_LABELS[o.status] ?? o.status} · {new Date(o.created_at).toLocaleDateString()}</span>
          </Link>
        ))}
      </div>
    );
  const invoiceList = (kind: "proforma" | "commercial") => {
    const list = invoices.filter((i) => i.kind === kind);
    return list.length === 0 ? <EmptyState title="No invoices" description="Invoices appear once generated from an order." /> : (
      <div className="space-y-2">
        {list.map((inv, i) => (
          <Link key={inv.id} to="/staff/orders/$orderId" params={{ orderId: inv.order_id }} className="flex justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
            <span><span className="list-number">{i + 1}.</span> {inv.invoice_number} v{inv.version}</span>
            <span className="flex items-center gap-2">{formatMoney(Number(inv.total_value), inv.currency)}<Badge variant="secondary">{inv.state !== "current" ? inv.state : inv.sent_at ? "Sent" : "Generated"}</Badge></span>
          </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-4">
          <div className="sm:col-span-4">
            <p className="text-lg font-semibold">{profile?.company_name || profile?.contact_name || "Customer"}</p>
            <p className="stat-label">{[profile?.contact_name, profile?.email, profile?.phone, profile?.shipping_country].filter(Boolean).join(" · ")}</p>
          </div>
          <div><p className="stat-label">Outstanding</p><p className="font-semibold">{formatMoney(Math.max(0, billed - paid), currency)}</p></div>
          <div><p className="stat-label">Paid</p><p className="font-semibold">{formatMoney(paid, currency)}</p></div>
          <div><p className="stat-label">Completed orders</p><p className="font-semibold">{completed.length}</p></div>
          <div><p className="stat-label">Last order</p><p className="font-semibold">{orders[0] ? new Date(orders[0].created_at).toLocaleDateString() : "—"}</p></div>
        </CardContent>
      </Card>
      <Tabs defaultValue="orders">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="shipments">Shipments</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="pi">Proforma invoices</TabsTrigger>
          <TabsTrigger value="ci">Commercial invoices</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="orders">{orderList(orders, "No orders")}</TabsContent>
        <TabsContent value="shipments">{orderList(shipments, "No shipments")}</TabsContent>
        <TabsContent value="payments">
          {payments.length === 0 ? <EmptyState title="No payments" description="Recorded payments appear here." /> : (
            <div className="space-y-2">
              {payments.map((p, i) => (
                <div key={p.id} className="flex justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
                  <span><span className="list-number">{i + 1}.</span> {new Date(p.paid_at).toLocaleDateString()} · {p.reference ?? p.method ?? "Payment"}</span>
                  <span className="flex items-center gap-2">{formatMoney(Number(p.amount), currency)}<Badge variant="secondary">{p.status}</Badge></span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="pi">{invoiceList("proforma")}</TabsContent>
        <TabsContent value="ci">{invoiceList("commercial")}</TabsContent>
        <TabsContent value="history">{orderList(completed, "No completed business")}</TabsContent>
        <TabsContent value="activity">
          {events.length === 0 ? <EmptyState title="No activity" description="Customer actions appear here." /> : (
            <div className="space-y-2">
              {events.map((e, i) => (
                <div key={e.id} className="flex justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
                  <span><span className="list-number">{i + 1}.</span> {e.action.replace(/_/g, " ")} · {e.entity_type}</span>
                  <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
