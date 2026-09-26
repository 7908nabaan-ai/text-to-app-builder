import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { calcOrderTotals, formatCbm, formatMoney } from "@/lib/calc";
import { STATUS_LABELS, logOrderEvent, type OrderLine } from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/staff/orders/$orderId")({
  head: () => ({
    meta: [
      { title: "Order review — Sky Plus" },
      { name: "description", content: "Review quantities, prices and status for a customer order." },
      { property: "og:title", content: "Order review — Sky Plus" },
      { property: "og:description", content: "Review quantities, prices and status of an order." },
    ],
  }),
  component: StaffOrderPage,
});

const NEXT_STATUSES = [
  "under_review",
  "awaiting_customer",
  "confirmed",
  "loading",
  "shipped",
  "completed",
] as const;

function StaffOrderPage() {
  const { orderId } = useParams({ from: "/_authenticated/staff/orders/$orderId" });
  return (
    <Page title="Order review">
      {({ isStaff }) =>
        isStaff ? (
          <OrderBody orderId={orderId} />
        ) : (
          <EmptyState title="Staff only" description="This page is for Sky Plus staff." />
        )
      }
    </Page>
  );
}

function OrderBody({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();

  const { data: order } = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, profiles:customer_id(company_name, contact_name, shipping_destination)")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: lines = [] } = useQuery({
    queryKey: ["order-lines", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_lines")
        .select("*")
        .eq("order_id", orderId)
        .order("product_name");
      if (error) throw error;
      return data as OrderLine[];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["order-events", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_events")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const updateLine = useMutation({
    mutationFn: async ({
      line,
      quantity,
      price,
    }: {
      line: OrderLine;
      quantity?: number;
      price?: number;
    }) => {
      const patch: {
        proposed_quantity?: number;
        current_quantity?: number;
        negotiated_price?: number;
      } = {};
      if (quantity !== undefined && quantity !== line.current_quantity) {
        patch.proposed_quantity = quantity;
        patch.current_quantity = quantity;
      }
      if (price !== undefined && price !== line.negotiated_price) patch.negotiated_price = price;
      if (Object.keys(patch).length === 0) return;
      const { error } = await supabase.from("order_lines").update(patch).eq("id", line.id);
      if (error) throw error;
      await logOrderEvent({
        order_id: orderId,
        event_type: price !== undefined ? "price_changed" : "quantity_changed",
        actor_role: "staff",
        sku: line.sku,
        product_name: line.product_name,
        previous_quantity: line.current_quantity,
        new_quantity: patch.current_quantity ?? line.current_quantity,
        previous_price: line.negotiated_price,
        new_price: patch.negotiated_price ?? line.negotiated_price,
      });
    },
    onSuccess: () => {
      toast.success("Line updated");
      void queryClient.invalidateQueries({ queryKey: ["order-lines", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["order-events", orderId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setStatus = useMutation({
    mutationFn: async (status: (typeof NEXT_STATUSES)[number]) => {
      if (!order) return;
      const patch: {
        status: (typeof NEXT_STATUSES)[number];
        finalized_at?: string;
        is_locked?: boolean;
        shipped_at?: string;
      } = { status };
      if (status === "confirmed") {
        patch.finalized_at = new Date().toISOString();
        patch.is_locked = true;
      }
      if (status === "shipped") patch.shipped_at = new Date().toISOString();
      if (status === "awaiting_customer" || status === "under_review") patch.is_locked = false;
      const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
      if (error) throw error;

      if (status === "confirmed") {
        const updates = lines.map((line) =>
          supabase
            .from("order_lines")
            .update({ final_quantity: line.current_quantity })
            .eq("id", line.id),
        );
        await Promise.all(updates);
      }

      await logOrderEvent({
        order_id: orderId,
        event_type: "status_changed",
        actor_role: "staff",
        previous_status: order.status,
        new_status: status,
      });
      await supabase.from("notifications").insert({
        user_id: order.customer_id,
        order_id: orderId,
        title: `Order ${order.order_number}: ${STATUS_LABELS[status] ?? status}`,
        body: "Open Sky Plus to see the latest details.",
      });
    },
    onSuccess: () => {
      toast.success("Status updated");
      void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["staff-orders"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!order) return null;

  const profile = (order as unknown as {
    profiles?: { company_name: string | null; contact_name: string | null; shipping_destination: string | null } | null;
  }).profiles;

  const totals = calcOrderTotals(
    lines.map((line) => ({
      cbmPerCarton: Number(line.cbm_per_carton),
      quantity: line.final_quantity ?? line.current_quantity,
      price: line.negotiated_price,
    })),
    Number(order.container_capacity_cbm),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-xl font-bold">{order.order_number}</p>
              <p className="text-sm text-muted-foreground">
                {profile?.company_name || profile?.contact_name}
                {profile?.shipping_destination ? ` · ${profile.shipping_destination}` : ""}
              </p>
            </div>
            <Badge>{STATUS_LABELS[order.status] ?? order.status}</Badge>
          </div>
          <Progress value={Math.min(totals.utilizationPercent, 100)} />
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="stat-label">Loaded</p>
              <p className="font-semibold">{formatCbm(totals.totalCbm)}</p>
            </div>
            <div>
              <p className="stat-label">Remaining</p>
              <p className="font-semibold">{formatCbm(totals.remainingCbm)}</p>
            </div>
            <div>
              <p className="stat-label">Value</p>
              <p className="font-semibold">{formatMoney(totals.totalValue)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {NEXT_STATUSES.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={order.status === status ? "default" : "outline"}
                onClick={() => setStatus.mutate(status)}
                disabled={setStatus.isPending}
              >
                {STATUS_LABELS[status]}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {lines.map((line) => (
        <Card key={line.id}>
          <CardContent className="space-y-3 pt-5">
            <div>
              <p className="font-medium">{line.product_name}</p>
              <p className="stat-label">
                {line.sku} · requested {line.requested_quantity}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`q-${line.id}`}>Quantity</Label>
                <Input
                  id={`q-${line.id}`}
                  type="number"
                  min={0}
                  className="h-11"
                  defaultValue={line.current_quantity}
                  onBlur={(e) => updateLine.mutate({ line, quantity: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`p-${line.id}`}>Agreed price</Label>
                <Input
                  id={`p-${line.id}`}
                  type="number"
                  step="0.01"
                  min={0}
                  className="h-11"
                  defaultValue={line.negotiated_price}
                  onBlur={(e) => updateLine.mutate({ line, price: Number(e.target.value) })}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Catalog price {formatMoney(line.catalog_price)} ·{" "}
              {formatCbm(line.cbm_per_carton * line.current_quantity)}
            </p>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="space-y-2 pt-5">
          <p className="stat-label">Activity</p>
          {events.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
          {events.map((event) => (
            <p key={event.id} className="text-sm text-muted-foreground">
              {new Date(event.created_at).toLocaleString()} · {event.actor_role ?? "system"} ·{" "}
              {event.event_type}
              {event.product_name ? ` · ${event.product_name}` : ""}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
