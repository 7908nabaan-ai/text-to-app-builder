import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { calcOrderTotals, formatCbm, formatMoney } from "@/lib/calc";
import { ACTIVE_STATUSES, STATUS_LABELS, logOrderEvent, type OrderLine } from "@/lib/orders";
import { ProductPhoto } from "@/components/product-photo";
import { ContactButtons } from "@/components/contact-buttons";
import { CustomerApproval } from "@/components/customer-approval";

export function CustomerOrder({ userId }: { userId: string }) {
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
      if (!order) return [];
      const { data, error } = await supabase
        .from("order_lines")
        .select("*")
        .eq("order_id", order.id)
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
        .update({ status: order.status === "draft" ? "submitted" : "customer_updated" })
        .eq("id", order.id);
      if (error) throw error;
      await logOrderEvent({
        order_id: order.id,
        event_type: "status_changed",
        actor_role: "customer",
        previous_status: order.status,
        new_status: order.status === "draft" ? "submitted" : "customer_updated",
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
  const editable = !order.is_locked && ["draft", "submitted", "under_review", "awaiting_customer", "customer_updated"].includes(order.status);

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
        <div className="max-h-[65vh] overflow-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-160 text-left text-xs">
            <thead className="sticky top-0 z-10 bg-card"><tr><th scope="col">No.</th><th>Product</th><th>Packing</th><th>Qty / CTN</th><th>CBM / CTN</th><th>Total CBM</th><th>Unit price</th><th>Total</th><th>Status</th><th /></tr></thead>
            <tbody>{lines.map((line, index) => {
              const quantity = line.final_quantity ?? line.current_quantity;
              return <tr key={line.id}><td className="tabular-nums">{index + 1}</td>
                <td><div className="flex items-center gap-2"><ProductPhoto path={line.image_path} alt={line.product_name} className="h-9 w-9" /><div className="min-w-28"><p className="font-semibold">{line.product_name}</p><p className="text-muted-foreground">{line.sku}</p></div></div></td>
                <td>{line.unit}</td>
                <td><div className="flex items-center"><Button size="icon" variant="outline" className="h-7 w-7" disabled={!editable || setQuantity.isPending} onClick={() => setQuantity.mutate({ line, quantity: quantity - 1 })} aria-label={`Decrease ${line.product_name}`}><Minus /></Button><span className="w-9 text-center font-semibold">{quantity}</span><Button size="icon" variant="outline" className="h-7 w-7" disabled={!editable || setQuantity.isPending} onClick={() => setQuantity.mutate({ line, quantity: quantity + 1 })} aria-label={`Increase ${line.product_name}`}><Plus /></Button></div></td>
                <td>{line.cbm_per_carton.toFixed(3)}</td><td>{(line.cbm_per_carton * quantity).toFixed(3)}</td><td>{formatMoney(line.negotiated_price)}</td><td className="font-semibold">{formatMoney(line.negotiated_price * quantity)}</td>
                <td><span className={line.approval_status === "approved" ? "text-success" : line.approval_status === "rejected" ? "text-destructive" : "text-muted-foreground"}>{line.approval_status === "approved" ? "Approved" : line.approval_status === "rejected" ? "Rejected" : "Pending"}</span></td>
                <td>{editable && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={setQuantity.isPending} onClick={() => setQuantity.mutate({ line, quantity: 0 })} aria-label={`Remove ${line.product_name}`}><Trash2 /></Button>}</td>
              </tr>;
            })}</tbody>
            <tfoot className="sticky bottom-0 z-10 bg-card"><tr><td colSpan={3} className="font-semibold">Order totals</td><td>{lines.reduce((sum, line) => sum + (line.final_quantity ?? line.current_quantity), 0)}</td><td /><td>{totals.totalCbm.toFixed(3)}</td><td /><td className="font-bold">{formatMoney(totals.totalValue)}</td><td colSpan={2} /></tr></tfoot>
          </table>
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
      <CustomerApproval order={order} disabled={lines.length === 0 || setQuantity.isPending || submitOrder.isPending} />
    </div>
  );
}
