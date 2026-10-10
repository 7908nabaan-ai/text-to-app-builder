import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_products",
  title: "Search catalogue",
  description: "Search active Sky Plus catalogue products by name or item number.",
  inputSchema: {
    query: z.string().trim().min(1).max(100).describe("Product name or item number, e.g. 'rice' or 'F-347'."),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum results (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    const supabase = supabaseForUser(ctx);
    const q = query.replace(/[%,()]/g, " ");
    const { data, error } = await supabase
      .from("products")
      .select("sku, name, unit, default_price, cbm_per_carton, gross_weight_kg")
      .eq("is_active", true)
      .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
      .order("name")
      .limit(limit ?? 20);
    if (error) throw new ToolError(error.message);
    const products = (data ?? []).map((p) => ({
      item_no: p.sku,
      name: p.name,
      packing: p.unit,
      price_usd: Number(p.default_price),
      cbm_per_carton: Number(p.cbm_per_carton),
      gross_weight_kg: p.gross_weight_kg == null ? null : Number(p.gross_weight_kg),
    }));
    return {
      content: [{ type: "text", text: products.length ? products.map((p) => `${p.item_no} · ${p.name} (${p.packing}) — $${p.price_usd}`).join("\n") : "No products found." }],
      structuredContent: { products },
    };
  },
});
