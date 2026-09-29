import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTIVE_STATUSES, STATUS_LABELS, logOrderEvent } from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Shipment history — Sky Plus" },
      { name: "description", content: "Every container you have shipped with Sky Plus." },
      { property: "og:title", content: "Shipment history — Sky Plus" },
      { property: "og:description", content: "Every container you have shipped with Sky Plus." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <Page title="Shipment history" description="Completed and shipped containers.">
      {({ isStaff }) => <HistoryList isStaff={isStaff} />}
    </Page>
  );
}

function HistoryList({ isStaff }: { isStaff: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data = [] } = useQuery({
    queryKey: ["shipment-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("status", ["shipped", "completed"])
        .order("shipped_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const repeat = useMutation({
    mutationFn: async (order: (typeof data)[number]) => {
      const { data: active } = await supabase
        .from("orders")
        .select("id")
        .eq("customer_id", order.customer_id)
        .in("status", [...ACTIVE_STATUSES])
        .limit(1);
      if (active && active.length > 0)
        throw new Error("You already have an order in progress. Finish it before repeating.");
      const { data: lines, error: le } = await supabase
        .from("order_lines")
        .select("product_id, sku, final_quantity, current_quantity")
        .eq("order_id", order.id);
      if (le) throw le;
      const ids = (lines ?? []).map((l) => l.product_id).filter((x): x is string => !!x);
      const { data: products } = await supabase
        .from("products")
        .select("id, sku, name, image_path, unit, cbm_per_carton, default_price, is_active, categories(name)")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
        .eq("is_active", true);
      const byId = new Map((products ?? []).map((p) => [p.id, p]));
      const { data: created, error: ce } = await supabase
        .from("orders")
        .insert({
          customer_id: order.customer_id,
          container_type_id: order.container_type_id,
          container_capacity_cbm: order.container_capacity_cbm,
          notes: `Repeat of ${order.order_number}`,
        })
        .select("id")
        .single();
      if (ce) throw ce;
      const newLines = (lines ?? []).flatMap((l) => {
        const p = l.product_id ? byId.get(l.product_id) : undefined;
        const qty = l.final_quantity ?? l.current_quantity;
        if (!p || qty <= 0) return [];
        return [{
          order_id: created.id, product_id: p.id, sku: p.sku, product_name: p.name,
          category_name: (p.categories as { name: string } | null)?.name ?? null,
          image_path: p.image_path, unit: p.unit, cbm_per_carton: p.cbm_per_carton,
          catalog_price: p.default_price, negotiated_price: p.default_price,
          requested_quantity: qty, current_quantity: qty,
        }];
      });
      if (newLines.length) {
        const { error } = await supabase.from("order_lines").insert(newLines);
        if (error) throw error;
      }
      await logOrderEvent({
        order_id: created.id, event_type: "order_repeated", actor_role: isStaff ? "staff" : "customer",
        new_status: "draft", reason: `Repeat of ${order.order_number}`,
      });
      return { skipped: (lines ?? []).length - newLines.length };
    },
    onSuccess: ({ skipped }) => {
      toast.success(skipped ? `New draft created. ${skipped} item(s) no longer available were left out.` : "New draft order created");
      void qc.invalidateQueries();
      if (!isStaff) void navigate({ to: "/dashboard" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (data.length === 0) {
    return <EmptyState title="No shipments yet" description="Shipped containers will be listed here." />;
  }

  return (
    <div className="space-y-3">
      {data.map((order) => (
        <Card key={order.id}>
          <CardContent className="flex items-center justify-between gap-3 pt-5">
            <div>
              <p className="font-medium">{order.order_number}</p>
              <p className="stat-label">
                {order.shipped_at ? new Date(order.shipped_at).toLocaleDateString() : "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge>{STATUS_LABELS[order.status] ?? order.status}</Badge>
              {!isStaff && (
                <Button size="sm" variant="outline" disabled={repeat.isPending} onClick={() => repeat.mutate(order)}>
                  Repeat order
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
