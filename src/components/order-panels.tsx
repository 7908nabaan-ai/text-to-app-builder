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
  if (line.availability === "unavailable") return { label: "Not available", className: "text-destructive", dot: "bg-destructive" };
  if (line.availability === "preorder") return { label: "Pre-order", className: "text-gold", dot: "bg-gold" };
  if (line.proposed_quantity != null || Number(line.negotiated_price) !== Number(line.catalog_price))
    return { label: "Changed by Sky Plus", className: "text-primary", dot: "bg-primary" };
  return { label: "OK", className: "text-success", dot: "bg-success" };
}

export function LineStatus({ line }: { line: StatusLine }) {
  const s = lineStatus(line);
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold", s.className)}><span className={cn("h-2 w-2 rounded-full", s.dot)} />{s.label}</span>;
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
            <span className={cn(i === idx ? "font-bold" : i > idx ? "text-muted-foreground" : "")}>{i + 1}. {step}</span>
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
    <section id="order-chat" className="rounded-md border border-border bg-card p-4">
      <h2 className="mb-3 font-bold">Discussion with Sky Plus</h2>
      <div className={cn("space-y-2 overflow-y-auto pr-1", compact ? "max-h-64" : "max-h-96")}>
        {messages.length === 0 && <p className="text-xs text-muted-foreground">No messages yet. Ask about prices, quantities or delivery.</p>}
        {messages.map((m, index) => {
          const staff = m.sender_role === "staff";
          return (
            <div key={m.id} className={cn("flex gap-2", staff ? "justify-start" : "justify-end")}>
              {staff && <span className="mt-4 flex h-7 w-9 shrink-0 items-center justify-center text-[9px] font-black leading-none text-primary">SKY<br />PLUS</span>}
              <div className="max-w-[80%]">
                <p className="mb-1 flex justify-between gap-4 text-[11px]"><span className="font-semibold"><span className="list-number">{index + 1}.</span> {staff ? "Sky Plus (Sales)" : "You"}</span><span className="text-muted-foreground">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></p>
                <div className={cn("rounded-lg px-3 py-2 text-xs", staff ? "bg-primary/10" : "bg-success/15")}>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(); }}>
        <Textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" className="min-h-9 text-xs" aria-label="Message" maxLength={2000} />
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
      <h2 className="mb-3 font-bold">Recent Changes</h2>
      {events.length === 0 ? <p className="text-xs text-muted-foreground">No changes yet</p> : (
        <ol className="space-y-3">{events.map((e, index) => (
          <li key={e.id} className="flex gap-2">
            <span className="w-14 shrink-0 pt-0.5 text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", e.actor_role === "customer" ? "bg-success" : "bg-primary")} />
            <div className="min-w-0 text-xs">
              <p className="font-medium"><span className="list-number">{index + 1}.</span> {e.actor_role === "customer" ? "You" : "Sky Plus"} · {e.event_type.replace(/_/g, " ")}{e.product_name ? ` · ${e.product_name}` : ""}</p>
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

const H_STEPS = ["Building Order", "Under Discussion", "Confirmed", "PI Issued", "Completed"];
const H_INDEX: Record<string, number> = { draft: 0, submitted: 1, under_review: 1, awaiting_customer: 1, customer_updated: 1, confirmed: 2, loading: 3, shipped: 3, completed: 4 };

/** Order header card with horizontal progress, as on the ordering screen. */
export function OrderHeaderCard({ order, statusLabel }: { order: { id: string; status: string; order_number: string; container_name: string | null; updated_at: string }; statusLabel: string }) {
  const { data: hasProforma = false } = useQuery({
    queryKey: ["order-has-proforma", order.id],
    queryFn: async () => {
      const { count } = await supabase.from("invoices").select("id", { count: "exact", head: true }).eq("order_id", order.id).eq("kind", "proforma");
      return (count ?? 0) > 0;
    },
  });
  let idx = H_INDEX[order.status] ?? 0;
  if (idx === 2 && hasProforma) idx = 3;
  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-display text-xl font-bold">Order {order.order_number}</h2>
        <span className="rounded bg-gold/25 px-2 py-1 text-[10px] font-bold uppercase">{statusLabel}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[110px_1fr] gap-y-1 text-xs">
        <dt className="text-muted-foreground">Container Type</dt><dd>: {order.container_name ?? "—"}</dd>
        <dt className="text-muted-foreground">Last Updated</dt><dd>: {new Date(order.updated_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</dd>
      </dl>
      <p className="mt-4 text-sm font-bold">Progress</p>
      <ol className="mt-3 flex">
        {H_STEPS.map((step, i) => (
          <li key={step} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && <span className={cn("absolute right-1/2 top-2.5 h-0.5 w-full", i <= idx ? "bg-primary" : "bg-border")} />}
            <span className={cn("relative z-10 flex h-5 w-5 items-center justify-center rounded-full", i <= idx ? "bg-primary text-primary-foreground" : "bg-muted-foreground/40 text-primary-foreground")}>
              {i < idx ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
            </span>
            <span className={cn("mt-1 text-[10px] leading-tight", i === idx ? "font-bold text-primary" : "text-muted-foreground")}>{i + 1}. {step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
