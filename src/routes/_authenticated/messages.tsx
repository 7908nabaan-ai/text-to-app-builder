import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { NegotiationChat } from "@/components/order-panels";
import { STATUS_LABELS } from "@/lib/orders";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Sky Plus" },
      { name: "description", content: "Order conversations with the Sky Plus team." },
      { property: "og:title", content: "Messages — Sky Plus" },
      { property: "og:description", content: "Order conversations with Sky Plus." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  return <Page title="Messages">{({ userId, isStaff }) => <Body userId={userId} isStaff={isStaff} />}</Page>;
}

function Body({ userId, isStaff }: { userId: string; isStaff: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { data: orders = [] } = useQuery({
    queryKey: ["message-orders", userId, isStaff],
    queryFn: async () => {
      let q = supabase.from("orders").select("id, order_number, status, customer_id, updated_at").order("updated_at", { ascending: false }).limit(100);
      if (!isStaff) q = q.eq("customer_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
  if (orders.length === 0) return <EmptyState title="No conversations yet" description="Each order has its own chat with Sky Plus." />;
  const current = selected ?? orders[0].id;
  return (
    <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
      <ul className="space-y-1">
        {orders.map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => setSelected(o.id)} className={cn("w-full rounded-md border px-3 py-2 text-left text-sm", current === o.id ? "border-primary bg-card" : "border-transparent hover:bg-card")}>
              <span className="font-semibold">{o.order_number}</span><span className="block text-xs text-muted-foreground">{STATUS_LABELS[o.status]}</span>
            </button>
          </li>
        ))}
      </ul>
      <NegotiationChat orderId={current} />
    </div>
  );
}
