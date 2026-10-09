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
import { OrderFinance } from "@/components/order-finance";
import { LiveOrderPanel } from "@/components/ordering";
import { BottomTotals, LineStatus, NegotiationChat } from "@/components/order-panels";
import { useContainerTypes } from "@/components/quick-order";

export const Route = createFileRoute("/_authenticated/staff/orders/$orderId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
      {({ isStaff, accountType }) =>
        isStaff ? (
          <OrderBody orderId={orderId} isOwner={accountType === "owner"} />
        ) : (
          <EmptyState title="Staff only" description="This page is for Sky Plus staff." />
        )
      }
    </Page>
  );
}

function OrderBody({ orderId, isOwner }: { orderId: string; isOwner: boolean }) {
  const queryClient = useQueryClient();

  const approve = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: "approved" | "rejected" }) => {
      const { error } = await supabase.from("order_lines").update({ approval_status: status }).in("id", ids);
      if (error) throw error;
      await logOrderEvent({ order_id: orderId, event_type: status === "approved" ? "lines_approved" : "lines_rejected", actor_role: "owner", reason: `${ids.length} line(s)` });
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "approved" ? "Approved" : "Rejected");
      void queryClient.invalidateQueries({ queryKey: ["order-lines", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["order-events", orderId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { data: order } = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return data;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_name, contact_name, shipping_destination")
        .eq("id", data.customer_id)
        .maybeSingle();
      return { ...data, profiles: profile };
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

  const { data: containers = [] } = useContainerTypes();
  const setAvailability = useMutation({
    mutationFn: async ({ line, availability }: { line: OrderLine; availability: string }) => {
      const { error } = await supabase.from("order_lines").update({ availability }).eq("id", line.id);
      if (error) throw error;
      await logOrderEvent({ order_id: orderId, event_type: "availability_changed", actor_role: "staff", sku: line.sku, product_name: line.product_name, reason: availability });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["order-lines", orderId] }),
    onError: (error: Error) => toast.error(error.message),
  });
  const setContainer = useMutation({
    mutationFn: async (containerTypeId: string) => {
      const { error } = await supabase.from("orders").update({ container_type_id: containerTypeId }).eq("id", orderId);
      if (error) throw error;
      await logOrderEvent({ order_id: orderId, event_type: "container_changed", actor_role: "staff", reason: containers.find((c) => c.id === containerTypeId)?.name ?? null });
    },
    onSuccess: () => { toast.success("Container changed"); void queryClient.invalidateQueries({ queryKey: ["order", orderId] }); },
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
      if (status === "confirmed" && lines.some((l) => (l.approval_status ?? "pending") === "pending")) {
        throw new Error("An owner must approve or reject every line before confirming.");
      }
      if (status === "confirmed") {
        if (!order.customer_approved_at || order.status !== "customer_updated") throw new Error("The customer must approve the negotiated order first.");
        patch.finalized_at = new Date().toISOString();
        patch.is_locked = true;
      }
      if (status === "shipped") patch.shipped_at = new Date().toISOString();
      if (status === "awaiting_customer" || status === "under_review") patch.is_locked = false;
      const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
      if (error) throw error;

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
      void queryClient.invalidateQueries({ queryKey: ["order-lines", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["order-events", orderId] });
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
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div className="min-w-0 space-y-4">
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
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Container</span>
            <select aria-label="Container type" className="h-9 rounded-md border border-input bg-card px-2" value={order.container_type_id} disabled={setContainer.isPending} onChange={(e) => setContainer.mutate(e.target.value)}>
              {containers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <p className="w-full text-sm font-semibold text-primary">{order.customer_approved_at ? "Customer approved · Ready for Sky Plus final approval" : "Customer approval pending"}</p>
            {NEXT_STATUSES.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={order.status === status ? "default" : "outline"}
                onClick={() => setStatus.mutate(status)}
                disabled={setStatus.isPending || (status === "confirmed" && (!order.customer_approved_at || order.status !== "customer_updated" || lines.some((l) => l.approval_status === "pending"))) || (["loading", "shipped", "completed"].includes(status) && !["confirmed", "loading", "shipped", "completed"].includes(order.status))}
              >
                {status === "confirmed" ? "Sky Plus final approval" : status === "awaiting_customer" ? "Send for customer approval" : STATUS_LABELS[status]}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {(() => {
        const pending = lines.filter((l) => (l.approval_status ?? "pending") === "pending");
        return (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
            <p className="text-sm">
              {pending.length === 0 ? "All lines reviewed." : `${pending.length} line(s) waiting for owner approval.`}
            </p>
            {isOwner && pending.length > 0 && (
              <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ ids: pending.map((l) => l.id), status: "approved" })}>
                Approve all pending
              </Button>
            )}
          </div>
        );
      })()}

      <section aria-label="Order items and totals" className="space-y-2">
      <div className="max-h-[65vh] space-y-3 overflow-auto">
      {lines.map((line, index) => (
        <Card key={line.id}>
          <CardContent className="p-0">
            <div className="space-y-3 border-b border-border p-4" aria-label={`Customer request for ${line.product_name}`}>
              <div>
                <p className="text-xs font-bold text-muted-foreground">Customer order</p>
                <p className="mt-1 font-medium"><span className="list-number">{index + 1}.</span> {line.product_name}</p>
                <p className="stat-label">{line.sku} · {line.unit}</p>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="stat-label">Requested quantity</dt><dd className="font-semibold">{line.requested_quantity}</dd></div>
                <div><dt className="stat-label">Catalog price</dt><dd className="font-semibold">{formatMoney(line.catalog_price)}</dd></div>
                <div><dt className="stat-label">CBM</dt><dd className="font-semibold">{formatCbm(line.cbm_per_carton * line.requested_quantity)}</dd></div>
                <div><dt className="stat-label">Requested total</dt><dd className="font-semibold">{formatMoney(line.catalog_price * line.requested_quantity)}</dd></div>
              </dl>
            </div>
            <div className="space-y-3 bg-primary/5 p-4" aria-label={`Sky Plus proposal for ${line.product_name}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-primary">Sky Plus proposal</p>
                <p className="mt-1 text-sm font-medium">{line.product_name}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <LineStatus line={line} />
                <select aria-label={`Availability of ${line.product_name}`} className="h-8 rounded-md border border-input bg-card px-2 text-xs" value={line.availability ?? "available"} onChange={(e) => setAvailability.mutate({ line, availability: e.target.value })}>
                  <option value="available">Available</option><option value="preorder">Pre-order</option><option value="unavailable">Unavailable</option>
                </select>
                <ApprovalBadge status={line.approval_status} />
              </div>
            </div>
            {isOwner && (
              <div className="flex gap-2">
                <Button size="sm" variant={line.approval_status === "approved" ? "default" : "outline"} disabled={approve.isPending} onClick={() => approve.mutate({ ids: [line.id], status: "approved" })}>Approve</Button>
                <Button size="sm" variant={line.approval_status === "rejected" ? "destructive" : "outline"} disabled={approve.isPending} onClick={() => approve.mutate({ ids: [line.id], status: "rejected" })}>Reject</Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`q-${line.id}`}>Proposed quantity</Label>
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
              {formatCbm(line.cbm_per_carton * line.current_quantity)} · Total {formatMoney(line.negotiated_price * line.current_quantity)}
            </p>
            </div>
          </CardContent>
        </Card>
      ))}
      </div>
      <BottomTotals order={order} lines={lines} />
      </section>

      <OrderFinance orderId={orderId} customerId={order.customer_id} isStaff />


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
    <div className="space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
      <LiveOrderPanel order={order} lines={lines} sticky={false} />
      <NegotiationChat orderId={orderId} compact />
    </div>
    </div>
  );
}

function ApprovalBadge({ status }: { status?: string | undefined }) {
  const s = status ?? "pending";
  const label = s === "approved" ? "Approved" : s === "rejected" ? "Rejected" : "Awaiting approval";
  return <Badge variant={s === "approved" ? "default" : s === "rejected" ? "destructive" : "secondary"}>{label}</Badge>;
}
