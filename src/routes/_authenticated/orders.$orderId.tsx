import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductPhoto } from "@/components/product-photo";
import { LiveOrderPanel } from "@/components/ordering";
import { LineStatus, NegotiationChat, RecentChanges, StatusTimeline } from "@/components/order-panels";
import { OrderFinance } from "@/components/order-finance";
import { CustomerApproval } from "@/components/customer-approval";
import { useCurrency } from "@/lib/currency";
import { formatKg } from "@/lib/calc";
import { STATUS_LABELS, type OrderLine } from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  head: () => ({
    meta: [
      { title: "Order details — Sky Plus" },
      { name: "description", content: "Negotiation, shipment tracking, invoices and payments for one order." },
      { property: "og:title", content: "Order details — Sky Plus" },
      { property: "og:description", content: "Negotiation, shipment, invoices and payments for an order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  return <Page title="Order details">{({ isStaff }) => <OrderDetail orderId={orderId} isStaff={isStaff} />}</Page>;
}

export function OrderDetail({ orderId, isStaff }: { orderId: string; isStaff: boolean }) {
  const { money } = useCurrency();
  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: lines = [] } = useQuery({
    queryKey: ["order-lines", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_lines").select("*").eq("order_id", orderId).order("product_name");
      if (error) throw error;
      return data as (OrderLine & { gross_weight_kg: number })[];
    },
  });
  if (isLoading) return null;
  if (!order) return <EmptyState title="Order not found" description="It may belong to another account." />;
  const editable = !isStaff && (order.status === "draft" || order.status === "awaiting_customer");
  const done = order.status === "shipped" || order.status === "completed";

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-4">
          <div className="min-w-0"><p className="font-display text-xl font-bold">{order.order_number}</p><p className="text-sm text-muted-foreground">{order.container_name ?? "Container"} · created {new Date(order.created_at).toLocaleDateString()}</p></div>
          <Badge className="ml-auto">{STATUS_LABELS[order.status] ?? order.status}</Badge>
          {editable && <Button asChild size="sm"><Link to="/catalog" search={{ order: order.id }}>{order.status === "draft" ? "Continue ordering" : "Respond to proposal"}</Link></Button>}
          {isStaff && <Button asChild size="sm" variant="outline"><Link to="/staff/orders/$orderId" params={{ orderId: order.id }}>Open staff review</Link></Button>}
          {!isStaff && <CustomerApproval order={order} disabled={lines.length === 0} />}
        </div>

        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-2 font-bold"><Truck className="h-4 w-4 text-primary" />Shipment tracking</h2>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div><p className="stat-label">Status</p><p className="font-semibold">{STATUS_LABELS[order.status]}</p></div>
            <div><p className="stat-label">Confirmed</p><p className="font-semibold">{order.finalized_at ? new Date(order.finalized_at).toLocaleDateString() : "—"}</p></div>
            <div><p className="stat-label">Shipped</p><p className="font-semibold">{order.shipped_at ? new Date(order.shipped_at).toLocaleDateString() : "Not yet"}</p></div>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-lg font-bold">{done ? "Final products" : "Negotiation"}</h2>
          <p className="text-xs text-muted-foreground">Your original request, the Sky Plus proposal, your response and the final confirmed quantity — every step is kept.</p>
          <div className="max-h-[65vh] overflow-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-180 text-left text-xs">
              <thead className="sticky top-0 z-10 bg-card"><tr><th scope="col">No.</th><th>Product / Order</th><th>Packing</th><th>Quantity</th><th>Your response</th><th>Final</th><th>Weight</th><th>Price</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>{lines.map((l, index) => {
                const qty = l.final_quantity ?? l.current_quantity;
                return (
                  <Fragment key={l.id}>
                  <tr aria-label={`Customer request for ${l.product_name}`}><td className="tabular-nums">{index + 1}</td>
                    <td><div className="flex items-center gap-2"><ProductPhoto path={l.image_path} alt={l.product_name} className="h-9 w-9" /><div><p className="font-semibold">{l.product_name}</p><p className="text-muted-foreground">{l.sku} · Customer order</p></div></div></td>
                    <td>{l.unit}</td>
                    <td>{l.requested_quantity}</td>
                    <td>—</td><td>—</td>
                    <td>{formatKg(Number(l.gross_weight_kg ?? 0) * l.requested_quantity)}</td>
                    <td>{money(Number(l.catalog_price))}</td>
                    <td className="font-semibold">{money(Number(l.catalog_price) * l.requested_quantity)}</td>
                    <td>Requested</td>
                  </tr>
                  <tr className="bg-primary/5" aria-label={`Sky Plus proposal for ${l.product_name}`}>
                    <td></td>
                    <td><p className="font-semibold text-primary">Sky Plus proposal</p><p className="text-muted-foreground">{l.product_name}</p></td>
                    <td>{l.unit}</td>
                    <td>{l.proposed_quantity ?? "—"}</td>
                    <td>{l.current_quantity}</td>
                    <td className="font-semibold">{l.final_quantity ?? "—"}</td>
                    <td>{formatKg(Number(l.gross_weight_kg ?? 0) * qty)}</td>
                    <td>{money(Number(l.negotiated_price))}</td>
                    <td className="font-semibold">{money(Number(l.negotiated_price) * qty)}</td>
                    <td><LineStatus line={l} /></td>
                  </tr>
                  </Fragment>
                );
              })}</tbody>
            </table>
          </div>
        </section>

        <OrderFinance orderId={order.id} customerId={order.customer_id} isStaff={isStaff} />
      </div>
      <div className="space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
        <LiveOrderPanel order={order} lines={lines} sticky={false} />
        <StatusTimeline order={order} />
        <NegotiationChat orderId={order.id} compact />
        <RecentChanges orderId={order.id} />
      </div>
    </div>
  );
}
