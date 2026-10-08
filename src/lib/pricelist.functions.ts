import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ExtractedRow = {
  sku: string;
  name: string;
  category: string;
  price: number | null;
  currency: string;
  unit: string;
  cbm_per_carton: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  description: string;
};

const num = { type: ["number", "null"] };
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["rows"],
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sku", "name", "category", "price", "currency", "unit", "cbm_per_carton", "length_cm", "width_cm", "height_cm", "description"],
        properties: {
          sku: { type: "string" },
          name: { type: "string" },
          category: { type: "string" },
          price: num,
          currency: { type: "string" },
          unit: { type: "string" },
          cbm_per_carton: num,
          length_cm: num,
          width_cm: num,
          height_cm: num,
          description: { type: "string" },
        },
      },
    },
  },
};

const INSTRUCTIONS = `You convert messy supplier price lists into clean catalog rows for a wholesale container importer.
Rules:
- One row per actual product. Skip headers, titles, totals, blank or note lines.
- sku: the supplier's item/product code exactly as written; if none, empty string.
- name: clean product name in Title Case, keep brand, size and pack (e.g. "Nescafe Classic 200g").
- category: a short general category (e.g. Beverages, Snacks, Dairy, Rice & Grains, Cleaning, Personal Care, Household). Use the list's own section heading when present.
- price: the price per carton/unit as a plain number, no currency symbols. Null if not shown.
- currency: ISO code as shown or implied (USD, MYR, ...). Default USD.
- unit: packing such as "24 x 200g" or "Carton". Default "Carton".
- cbm_per_carton and carton dimensions in cm only when present in the source, else null. Never invent numbers.
- description: brief extra detail from the source, else empty string.`;

export const extractPriceList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ text: z.string().trim().min(5).max(60000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase.rpc("is_staff");
    if (!staff) throw new Error("Only Owners and Admins can read supplier price lists.");
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions: INSTRUCTIONS,
        input: `Supplier price list:\n${data.text}`,
        text: { format: { type: "json_schema", name: "price_list", strict: true, schema } },
      }),
    });
    if (!res.ok || !res.body) {
      const body = await res.text();
      if (res.status === 429) throw new Error("Too many AI requests right now. Please wait a minute and try again.");
      if (res.status === 402) throw new Error("AI credits have run out. Add credits in Settings → Plans & credits.");
      if (res.status === 403) throw new Error("AI access is blocked for this workspace. Please contact your workspace admin.");
      throw new Error(`AI request failed [${res.status}]: ${body.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let refused = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload) as { type?: string; delta?: string };
          if (evt.type === "response.output_text.delta" && evt.delta) text += evt.delta;
          if (evt.type === "response.refusal.delta") refused = true;
        } catch {
          // partial frame
        }
      }
    }
    if (refused) throw new Error("The AI declined to read this file.");
    try {
      const parsed = JSON.parse(text) as { rows: ExtractedRow[] };
      return { rows: parsed.rows };
    } catch {
      throw new Error("The AI returned an unexpected answer for part of the file. Please try again.");
    }
  });
