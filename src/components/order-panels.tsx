import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCbm, formatKg } from "@/lib/calc";
import { useCurrency } from "@/lib/currency";
import { orderLoad, type PanelLine, type PanelOrder } from "@/components/ordering";
import { cn } from "@/lib/utils";

type StatusLine = { availability?: string | null; proposed_quantity: number | null; negotiated_price: number; catalog_price: number };

/** Green available · blue updated by Sky Plus · yellow pre-order · red unavailable. */
export function lineStatus(line: StatusLine) {
  if (line.availability === "unavailable") return { label: "Unavailable", className: "bg-destructive/15 text-destructive", dot: "bg-destructive" };
  if (line.availability === "preorder") return { label: "Pre-order", className: "bg-gold/20 text-foreground", dot: "bg-gold" };
  if (line.proposed_quantity != null || Number(line.negotiated_price) !== Number(line.catalog_price))
    return { label: "Updated by Sky Plus", className: "bg-primary/15 text-primary", dot: "bg-primary" };
  return { label: "Available", className: "bg-success/15 text-success", dot: "bg-success" };
}

export function LineStatus({ line }: { line: StatusLine }) {
  const s = lineStatus(line);
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold", s.className)}><span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />{s.label}</span>;
}

export function BottomTotals({ order, lines }: { order: PanelOrder; lines: PanelLine[] }) {
  const { usd, myr } = useCurrency();
  const t = orderLoad(order, lines);
  const cell = (label: string, value: string) => <div className="min-w-0"><p className="stat-label">{label}</p><p className="truncate font-bold">{value}</p></div>;
  return (
    <div className="sticky bottom-0 z-10 grid grid-cols-2 gap-3 rounded-md border border-border bg-card p-3 shadow-md sm:grid-cols-5">
      {cell("Total cartons", String(t.totalCartons))}
      {cell("Total CBM", formatCbm(t.totalCbm))}
      {cell("Gross weight", formatKg(t.totalWeightKg))}
      {cell("USD total", usd(t.totalValue))}
      {cell("MYR total", myr(t.totalValue))}
    </div>
  );
}

const STEPS = ["Draft", "Submitted", "Under discussion", "Confirmed", "Proforma generated", "Loading", "Shipped", "Completed"];
const STEP_INDEX: Record<string, number> = { draft: 0, submitted: 1, under_review: 2, awaiting_customer: 2, customer_updated: 2, confirmed: 3, loading: 5, shipped: 6, completed: 7 };

export function StatusTimeline({ order }: { order: { id: string; status: string } }) {
  const { data: hasProforma = false } = useQuery({
    queryKey: ["order-has-proforma", order.id],
    queryFn: async () => {
      const { count } = await supabase.from("invoices").select("id", { count: "exact", head: true }).eq("order_id", order.id).eq("kind", "proforma");
      return (count ?? 0) > 0;
    },
  });
  let idx = STEP_INDEX[order.status] ?? 0;
  if (idx === 3 && hasProforma) idx = 4;
  return (
    <section className="rounded-md border border-border bg-card p-4">
      <h2 className="mb-3 font-bold">Order status</h2>
      <ol className="space-y-2">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-center gap-2 text-xs">
            <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]", i < idx ? "border-success bg-success text-primary-foreground" : i === idx ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
              {i < idx ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={cn(i === idx ? "font-bold" : i > idx ? "text-muted-foreground" : "")}>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function NegotiationChat({ orderId, compact = false }: { orderId: string; compact?: boolean }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const { data: messages = [] } = useQuery({
    queryKey: ["order-messages", orderId],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.from("order_messages").select("*").eq("order_id", orderId).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const send = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("order_messages").insert({ order_id: orderId, body: text.trim(), sender_id: auth.user!.id });
      if (error) throw error;
    },
    onSuccess: () => { setText(""); void qc.invalidateQueries({ queryKey: ["order-messages", orderId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="rounded-md border border-border bg-card p-4">
      <h2 className="mb-3 font-bold">Negotiation chat</h2>
      <div className={cn("space-y-2 overflow-y-auto pr-1", compact ? "max-h-64" : "max-h-96")}>
        {messages.length === 0 && <p className="text-xs text-muted-foreground">No messages yet. Ask about prices, quantities or delivery.</p>}
        {messages.map((m) => {
          const staff = m.sender_role === "staff";
          return (
            <div key={m.id} className={cn("flex", staff ? "justify-start" : "justify-end")}>
              <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-xs", staff ? "bg-muted" : "bg-primary text-primary-foreground")}>
                <p className="mb-0.5 text-[10px] font-semibold opacity-80">{staff ? "Sky Plus" : "Customer"} · {new Date(m.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            </div>
          );
        })}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(); }}>
        <Textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" className="min-h-9 text-xs" aria-label="Message" maxLength={2000} />
        <Button type="submit" size="icon" disabled={!text.trim() || send.isPending} aria-label="Send message"><Send /></Button>
      </form>
    </section>
  );
}

export function RecentChanges({ orderId }: { orderId: string }) {
  const { data: events = [] } = useQuery({
    queryKey: ["order-activity", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_events").select("*").eq("order_id", orderId).order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data;
    },
  });
  return (
    <section className="rounded-md border border-border bg-card p-4">
      <h2 className="mb-3 font-bold">Recent changes</h2>
      {events.length === 0 ? <p className="text-xs text-muted-foreground">No changes yet</p> : (
        <ol className="space-y-3">{events.map((e) => (
          <li key={e.id} className="flex gap-2">
            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", e.actor_role === "customer" ? "bg-muted-foreground" : "bg-primary")} />
            <div className="min-w-0 text-xs">
              <p className="font-medium">{e.actor_role === "customer" ? "You" : "Sky Plus"} · {e.event_type.replace(/_/g, " ")}{e.product_name ? ` · ${e.product_name}` : ""}</p>
              <p className="text-muted-foreground">{new Date(e.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}{e.new_quantity != null ? ` · ${e.previous_quantity ?? 0} → ${e.new_quantity} ctn` : ""}{e.new_price != null && e.previous_price !== e.new_price ? ` · price ${e.previous_price} → ${e.new_price}` : ""}{e.new_status ? ` · ${e.new_status.replace(/_/g, " ")}` : ""}</p>
            </div>
          </li>
        ))}</ol>
      )}
    </section>
  );
}

export function OrderSidePanels({ order }: { order: { id: string; status: string } }) {
  return (
    <>
      <StatusTimeline order={order} />
      <NegotiationChat orderId={order.id} compact />
      <RecentChanges orderId={order.id} />
    </>
  );
}
