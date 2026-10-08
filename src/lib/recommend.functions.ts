import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Recommendation = { id: string; reason: string };

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "items"],
  properties: {
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "reason"],
        properties: { id: { type: "string" }, reason: { type: "string" } },
      },
    },
  },
};

export const recommendProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ need: z.string().trim().min(3).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured.");

    const { data: products, error } = await context.supabase
      .from("products")
      .select("id, name, unit, default_price, categories(name)")
      .eq("is_active", true)
      .limit(800);
    if (error) throw new Error(error.message);

    const list = (products ?? [])
      .map((p) => {
        const cat = (p as unknown as { categories?: { name?: string } }).categories?.name ?? "";
        return `${p.id} | ${p.name} | ${p.unit} | ${cat} | $${p.default_price}`;
      })
      .join("\n");

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
        instructions:
          "You help wholesale buyers pick products from a catalog. Only recommend products from the list, by exact id. Recommend up to 12 items, best match first, each with a one-sentence reason. Write a short summary of 1-2 sentences.",
        input: `Catalog (id | name | packing | category | price per carton):\n${list}\n\nCustomer need: ${data.need}`,
        text: { format: { type: "json_schema", name: "recommendations", strict: true, schema } },
      }),
    });
    if (!res.ok || !res.body) {
      const body = await res.text();
      if (res.status === 429) throw new Error("Too many requests right now. Please try again shortly.");
      if (res.status === 402) throw new Error("AI credits have run out. Please contact Sky Plus.");
      throw new Error(`AI request failed [${res.status}]: ${body.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n");
      buffer = frames.pop() ?? "";
      for (const line of frames) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload) as { type?: string; delta?: string };
          if (evt.type === "response.output_text.delta" && evt.delta) text += evt.delta;
        } catch {
          // partial frame
        }
      }
    }

    let parsed: { summary: string; items: Recommendation[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("The assistant returned an unexpected answer. Please try again.");
    }
    const valid = new Set((products ?? []).map((p) => p.id));
    return {
      summary: parsed.summary,
      items: parsed.items.filter((i) => valid.has(i.id)).slice(0, 12),
    };
  });
