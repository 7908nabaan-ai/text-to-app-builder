import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { calcOrderTotals, formatCbm, formatMoney } from "@/lib/calc";
import { ACTIVE_STATUSES, STATUS_LABELS, logOrderEvent, type OrderLine } from "@/lib/orders";
import { ContactButtons } from "@/components/contact-buttons";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "My order — Sky Plus" },
      { name: "description", content: "Your current container order, capacity and totals." },
      { property: "og:title", content: "My order — Sky Plus" },
      { property: "og:description", content: "Your current container order, capacity and totals." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <Page title="Orders">
      {({ isStaff, userId }) => (isStaff ? <StaffOrders /> : <CustomerOrder userId={userId} />)}
    </Page>
  );
}

function StaffOrders() {
  const { data = [] } = useQuery({
    queryKey: ["staff-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, profiles:customer_id(company_name, contact_name)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
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

function CustomerOrder({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ["current-order", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_id", userId)
        .in("status", [...ACTIVE_STATUSES])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: lines = [] } = useQuery({
    queryKey: ["order-lines", order?.id],
    enabled: Boolean(order?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_lines")
        .select("*")
        .eq("order_id", order!.id)
        .order("product_name");
      if (error) throw error;
      return data as OrderLine[];
    },
  });

  const setQuantity = useMutation({
    mutationFn: async ({ line, quantity }: { line: OrderLine; quantity: number }) => {
      if (quantity <= 0) {
        const { error } = await supabase.from("order_lines").delete().eq("id", line.id);
        if (error) throw error;
        await logOrderEvent({
          order_id: line.order_id,
          event_type: "line_removed",
          actor_role: "customer",
          sku: line.sku,
          product_name: line.product_name,
          previous_quantity: line.current_quantity,
          new_quantity: 0,
        });
        return;
      }
      const { error } = await supabase
        .from("order_lines")
        .update({ current_quantity: quantity })
        .eq("id", line.id);
      if (error) throw error;
      await logOrderEvent({
        order_id: line.order_id,
        event_type: "quantity_changed",
        actor_role: "customer",
        sku: line.sku,
        product_name: line.product_name,
        previous_quantity: line.current_quantity,
        new_quantity: quantity,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["order-lines", order?.id] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const submitOrder = useMutation({
    mutationFn: async () => {
      if (!order) return;
      const { error } = await supabase
        .from("orders")
        .update({ status: "submitted" })
        .eq("id", order.id);
      if (error) throw error;
      await logOrderEvent({
        order_id: order.id,
        event_type: "status_changed",
        actor_role: "customer",
        previous_status: order.status,
        new_status: "submitted",
      });
    },
    onSuccess: () => {
      toast.success("Order sent to Sky Plus");
      void queryClient.invalidateQueries({ queryKey: ["current-order", userId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return null;

  if (!order) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No active order"
          description="Start by adding products from the catalog."
        />
        <Button className="h-11 w-full" onClick={() => navigate({ to: "/catalog" })}>
          Browse catalog
        </Button>
        <ContactButtons />
      </div>
    );
  }

  const totals = calcOrderTotals(
    lines.map((line) => ({
      cbmPerCarton: Number(line.cbm_per_carton),
      quantity: line.final_quantity ?? line.current_quantity,
      price: line.negotiated_price,
    })),
    Number(order.container_capacity_cbm),
  );
  const editable = order.status === "draft" || order.status === "awaiting_customer";

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-xl font-bold">{order.order_number}</p>
              <p className="stat-label">Container {formatCbm(Number(order.container_capacity_cbm))}</p>
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
          {totals.isOverCapacity && (
            <p className="text-sm font-medium text-destructive">
              Over container capacity — reduce quantities before submitting.
            </p>
          )}
        </CardContent>
      </Card>

      {lines.length === 0 ? (
        <EmptyState title="Your order is empty" description="Add products from the catalog." />
      ) : (
        <div className="space-y-3">
          {lines.map((line) => {
            const quantity = line.final_quantity ?? line.current_quantity;
            return (
              <Card key={line.id}>
                <CardContent className="space-y-3 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{line.product_name}</p>
                      <p className="stat-label">{line.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatMoney(line.negotiated_price)}</p>
                      {line.negotiated_price !== line.catalog_price && (
                        <p className="stat-label line-through">
                          {formatMoney(line.catalog_price)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-11 w-11"
                        disabled={!editable}
                        onClick={() => setQuantity.mutate({ line, quantity: quantity - 1 })}
                        aria-label="Decrease"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-10 text-center font-semibold">{quantity}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-11 w-11"
                        disabled={!editable}
                        onClick={() => setQuantity.mutate({ line, quantity: quantity + 1 })}
                        aria-label="Increase"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{formatCbm(line.cbm_per_carton * quantity)}</p>
                      <p className="font-medium text-foreground">
                        {formatMoney(line.negotiated_price * quantity)}
                      </p>
                    </div>
                    {editable && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-11 w-11 text-destructive"
                        onClick={() => setQuantity.mutate({ line, quantity: 0 })}
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="outline" className="h-11" onClick={() => navigate({ to: "/catalog" })}>
          Add more products
        </Button>
        <Button
          className="h-11"
          disabled={!editable || lines.length === 0 || totals.isOverCapacity || submitOrder.isPending}
          onClick={() => submitOrder.mutate()}
        >
          {order.status === "draft" ? "Submit order" : "Send update"}
        </Button>
      </div>

      <ContactButtons message={`Hello Sky Plus, about order ${order.order_number}`} />
    </div>
  );
}
