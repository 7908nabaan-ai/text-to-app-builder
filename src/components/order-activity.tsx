import { useQuery } from "@tanstack/react-query";
import { Clock, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_STATUSES, STATUS_LABELS } from "@/lib/orders";
import { Badge } from "@/components/ui/badge";
import { ContactButtons } from "@/components/contact-buttons";

export function OrderActivity({ userId }: { userId: string }) {
  const { data: order } = useQuery({
    queryKey: ["current-order", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").eq("customer_id", userId).in("status", [...ACTIVE_STATUSES]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: events = [] } = useQuery({
    queryKey: ["order-activity", order?.id],
    enabled: Boolean(order),
    queryFn: async () => {
      if (!order) return [];
      const { data, error } = await supabase.from("order_events").select("*").eq("order_id", order.id).order("created_at", { ascending: false }).limit(8);
      if (error) throw error;
      return data;
    },
  });
  return <aside className="space-y-4 xl:sticky xl:top-20">
    <section className="border-b border-border bg-card p-4">
      <h2 className="mb-3 text-lg font-bold">{order ? `Order ${order.order_number}` : "Your container order"}</h2>
      {order ? <><Badge variant="secondary">{STATUS_LABELS[order.status] ?? order.status}</Badge><p className="mt-3 text-xs text-muted-foreground">Last updated: {new Date(order.updated_at).toLocaleDateString()}</p><div className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-sm"><Clock className="h-4 w-4 text-primary" />{STATUS_LABELS[order.status]}</div></> : <p className="text-sm text-muted-foreground">No active order</p>}
    </section>
    <section className="border-b border-border bg-card p-4">
      <h2 className="mb-4 flex items-center gap-2 font-bold"><MessageCircle className="h-4 w-4 text-primary" />Contact Sky Plus</h2>
      <ContactButtons message={order ? `Hello Sky Plus, about order ${order.order_number}` : "Hello Sky Plus"} />
    </section>
    <section className="bg-card p-4">
      <h2 className="mb-4 font-bold">Recent changes</h2>
      {events.length === 0 ? <p className="text-xs text-muted-foreground">No recent changes</p> : <ol className="space-y-4">{events.map((event, index) => <li key={event.id} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /><div><p className="text-xs font-medium"><span className="list-number">{index + 1}.</span> {event.product_name || "Order"} · {event.event_type.replace(/_/g, " ")}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(event.created_at).toLocaleDateString()}{event.new_quantity != null ? ` · ${event.new_quantity} cartons` : ""}</p></div></li>)}</ol>}
    </section>
  </aside>;
}