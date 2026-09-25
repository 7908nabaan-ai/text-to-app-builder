import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Shipment history — Sky Plus" },
      { name: "description", content: "Every container you have shipped with Sky Plus." },
      { property: "og:title", content: "Shipment history — Sky Plus" },
      { property: "og:description", content: "Every container you have shipped with Sky Plus." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <Page title="Shipment history" description="Completed and shipped containers.">
      {() => <HistoryList />}
    </Page>
  );
}

function HistoryList() {
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

  if (data.length === 0) {
    return (
      <EmptyState title="No shipments yet" description="Shipped containers will be listed here." />
    );
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
            <Badge>{STATUS_LABELS[order.status] ?? order.status}</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
