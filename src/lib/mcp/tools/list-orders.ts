import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_orders",
  title: "List orders",
  description: "List the most recent container orders visible to the signed-in account.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("Maximum orders (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, status, is_locked, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (error) throw new ToolError(error.message);
    const orders = (data ?? []).map((o) => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      locked: o.is_locked,
      created_at: o.created_at,
      updated_at: o.updated_at,
    }));
    return {
      content: [{ type: "text", text: orders.length ? orders.map((o) => `${o.order_number} — ${o.status} (id ${o.id})`).join("\n") : "No orders found." }],
      structuredContent: { orders },
    };
  },
});
