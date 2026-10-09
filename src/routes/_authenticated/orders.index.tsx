import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTIVE_STATUSES, NEGOTIATION_STATUSES, STATUS_LABELS } from "@/lib/orders";
import { useCurrency } from "@/lib/currency";
import { formatCbm } from "@/lib/calc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/orders/")({
  head: () => ({
    meta: [
      { title: "My orders — Sky Plus" },
      { name: "description", content: "Current orders, negotiations and shipments in progress." },
      { property: "og:title", content: "My orders — Sky Plus" },
      { property: "og:description", content: "Current orders, negotiations and shipments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  return (
    <Page title="My orders" description="Everything in progress — drafts, negotiations and shipments." actions={<Button asChild><Link to="/catalog" search={{ order: "" }}>New order</Link></Button>}>
      {({ userId }) => <OrdersList userId={userId} />}
    </Page>
  );
}

export function useOrderSummaries(filter: { customerId?: string; statuses: readonly string[] }) {
  return useQuery({
    queryKey: ["order-summaries", filter.customerId ?? "all", filter.statuses.join(",")],
    queryFn: async () => {
      let q = supabase.from("orders").select("*").in("status", [...filter.statuses] as never).order("updated_at", { ascending: false });
      if (filter.customerId) q = q.eq("customer_id", filter.customerId);
      const { data: orders, error } = await q;
      if (error) throw error;
      const ids = orders.map((o) => o.id);
      const { data: lines } = ids.length ? await supabase.from("order_lines").select("order_id, cbm_per_carton, negotiated_price, current_quantity, final_quantity").in("order_id", ids) : { data: [] };
      return orders.map((o) => {
        const ls = (lines ?? []).filter((l) => l.order_id === o.id);
        const qty = (l: (typeof ls)[number]) => l.final_quantity ?? l.current_quantity;
        return { ...o, value: ls.reduce((s, l) => s + Number(l.negotiated_price) * qty(l), 0), cbm: ls.reduce((s, l) => s + Number(l.cbm_per_carton) * qty(l), 0), cartons: ls.reduce((s, l) => s + qty(l), 0) };
      });
    },
  });
}

function OrdersList({ userId }: { userId: string }) {
  const { money } = useCurrency();
  const { data = [], isLoading } = useOrderSummaries({ customerId: userId, statuses: ACTIVE_STATUSES });
  if (isLoading) return null;
  if (data.length === 0) return <EmptyState title="No orders in progress" description="Start a new order to choose your container." />;
  return (
    <div className="space-y-2">
      {data.map((o, index) => {
        const negotiating = (NEGOTIATION_STATUSES as readonly string[]).includes(o.status);
        const needsYou = o.status === "awaiting_customer";
        return (
          <Link key={o.id} to="/orders/$orderId" params={{ orderId: o.id }} className={cn("flex flex-wrap items-center gap-3 rounded-md border bg-card p-4 hover:border-primary", needsYou ? "border-gold" : "border-border")}>
            <div className="min-w-0 flex-1"><p className="font-semibold"><span className="list-number">{index + 1}.</span> {o.order_number}</p><p className="text-xs text-muted-foreground">{o.container_name} · {o.cartons} cartons · {formatCbm(o.cbm)} of {formatCbm(Number(o.container_capacity_cbm))}</p></div>
            <p className="font-bold">{money(o.value)}</p>
            {negotiating && <Badge variant="outline">Negotiation</Badge>}
            <Badge variant={needsYou ? "default" : "secondary"}>{STATUS_LABELS[o.status]}</Badge>
          </Link>
        );
      })}
    </div>
  );
}
