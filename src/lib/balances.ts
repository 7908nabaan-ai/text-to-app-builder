import { supabase } from "@/integrations/supabase/client";
import { calcBalance } from "@/lib/calc";

/**
 * Per-order balances: value = current commercial invoice, else current proforma,
 * else the order lines. Balance = value − confirmed payments (shared rule in calc.ts).
 */
export async function fetchOrderBalances(customerId?: string) {
  let oq = supabase.from("orders").select("id, order_number, customer_id, status, created_at, shipped_at, container_name").neq("status", "draft");
  if (customerId) oq = oq.eq("customer_id", customerId);
  const { data: orders, error } = await oq.order("created_at", { ascending: false });
  if (error) throw error;
  const ids = orders.map((o) => o.id);
  const safe = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
  const [inv, pay, lines] = await Promise.all([
    supabase.from("invoices").select("order_id, kind, state, total_value").in("order_id", safe).eq("state", "current"),
    supabase.from("payments").select("*").in("order_id", safe).order("paid_at", { ascending: false }),
    supabase.from("order_lines").select("order_id, negotiated_price, current_quantity, final_quantity").in("order_id", safe),
  ]);
  const payments = pay.data ?? [];
  const rows = orders.map((o) => {
    const invs = (inv.data ?? []).filter((i) => i.order_id === o.id);
    const ci = invs.find((i) => i.kind === "commercial");
    const pi = invs.find((i) => i.kind === "proforma");
    const lineValue = (lines.data ?? []).filter((l) => l.order_id === o.id).reduce((s, l) => s + Number(l.negotiated_price) * (l.final_quantity ?? l.current_quantity), 0);
    const value = Number(ci?.total_value ?? pi?.total_value ?? lineValue);
    const confirmed = payments.filter((p) => p.order_id === o.id && p.status === "confirmed").map((p) => ({ amount: Number(p.amount) }));
    return { ...o, invoiced: Boolean(ci || pi), ...calcBalance(value, confirmed) };
  });
  return { rows, payments, orderNumber: new Map(orders.map((o) => [o.id, o.order_number])) };
}
