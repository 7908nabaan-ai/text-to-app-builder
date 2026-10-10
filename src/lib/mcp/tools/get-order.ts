import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_order",
  title: "Get order details",
  description: "Show one order's status and items, including quantities and agreed prices.",
  inputSchema: {
    order: z.string().trim().min(1).describe("Order id or order number, e.g. 'SO-1001'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ order }, ctx) => {
    const supabase = supabaseForUser(ctx);
    const isUuid = /^[0-9a-f-]{36}$/i.test(order);
    const { data: o, error } = await supabase
      .from("orders")
      .select("id, order_number, status, is_locked, created_at")
      .eq(isUuid ? "id" : "order_number", order)
      .maybeSingle();
    if (error) throw new ToolError(error.message);
    if (!o) throw new ToolError("Order not found.");
    const { data: lines, error: le } = await supabase
      .from("order_lines")
      .select("sku, product_name, unit, requested_quantity, current_quantity, final_quantity, negotiated_price")
      .eq("order_id", o.id)
      .order("created_at");
    if (le) throw new ToolError(le.message);
    const items = (lines ?? []).map((l) => {
      const qty = l.final_quantity ?? l.current_quantity;
      return {
        item_no: l.sku,
        name: l.product_name,
        packing: l.unit,
        requested_quantity: l.requested_quantity,
        quantity: qty,
        price_usd: Number(l.negotiated_price),
        total_usd: Math.round(qty * Number(l.negotiated_price) * 100) / 100,
      };
    });
    const total = Math.round(items.reduce((s, i) => s + i.total_usd, 0) * 100) / 100;
    const summary = { id: o.id, order_number: o.order_number, status: o.status, locked: o.is_locked, created_at: o.created_at, total_usd: total };
    return {
      content: [{ type: "text", text: `${o.order_number} — ${o.status}, ${items.length} items, total $${total}\n` + items.map((i) => `${i.item_no} ${i.name}: ${i.quantity} × $${i.price_usd}`).join("\n") }],
      structuredContent: { order: summary, items },
    };
  },
});
