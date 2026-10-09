import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { recommendProducts, type Recommendation } from "@/lib/recommend.functions";
import { Textarea } from "@/components/ui/textarea";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { formatCbm, formatMoney } from "@/lib/calc";
import { QuickOrder } from "@/components/quick-order";
import { useCatalogProducts } from "@/components/ordering";
import { addProductToOrder, getDraftOrder } from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/catalog")({
  validateSearch: zodValidator(z.object({ order: fallback(z.string(), "").default("") })),
  head: () => ({
    meta: [
      { title: "Order & catalogue — Sky Plus" },
      { name: "description", content: "Browse the catalogue, build your container and negotiate with Sky Plus on one screen." },
      { property: "og:title", content: "Order & catalogue — Sky Plus" },
      { property: "og:description", content: "Build your container order on one screen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CatalogPage,
});

function CatalogPage() {
  const { order } = Route.useSearch();
  const navigate = useNavigate({ from: "/catalog" });
  return (
    <Page title="Order & catalogue">
      {({ userId, isStaff }) => isStaff ? (
        <p className="text-sm text-muted-foreground">Staff manage the catalogue under Products.</p>
      ) : (
        <div className="space-y-4">
          <AiFinder userId={userId} />
          <QuickOrder userId={userId} orderId={order || undefined} onSelectOrder={(id) => void navigate({ search: { order: id ?? "" } })} />
        </div>
      )}
    </Page>
  );
}

function AiFinder({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: products = [] } = useCatalogProducts();
  const byId = new Map(products.map((p) => [p.id, p]));
  const recommend = useServerFn(recommendProducts);
  const [need, setNeed] = useState("");
  const [recs, setRecs] = useState<{ summary: string; items: Recommendation[] } | null>(null);
  const ask = useMutation({
    mutationFn: () => recommend({ data: { need } }),
    onSuccess: (r) => setRecs(r),
    onError: (e: Error) => toast.error(e.message),
  });
  const add = useMutation({
    mutationFn: async (p: (typeof products)[number]) => {
      const order = await getDraftOrder(userId);
      if (!order) throw new Error("Select a container first to start your order.");
      await addProductToOrder(order, p);
    },
    onSuccess: () => { toast.success("Added to your order"); void qc.invalidateQueries({ queryKey: ["order-lines"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <details className="rounded-md border border-border bg-card p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Wand2 className="h-4 w-4 text-gold" />Not sure what to order? Describe what you need</summary>
      <div className="mt-3 space-y-3">
        <Textarea placeholder="e.g. Drinks and snacks for a small resort shop" value={need} onChange={(e) => setNeed(e.target.value)} />
        <Button disabled={need.trim().length < 3 || ask.isPending} onClick={() => ask.mutate()}>{ask.isPending ? "Finding products…" : "Suggest products"}</Button>
        {recs && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{recs.summary}</p>
            {recs.items.length === 0 && <p className="text-sm">No matching products found.</p>}
            {recs.items.map((r) => {
              const p = byId.get(r.id);
              if (!p) return null;
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                  <div className="min-w-0 flex-1"><p className="font-medium">{p.name}</p><p className="text-sm text-muted-foreground">{r.reason}</p><p className="stat-label">{formatMoney(p.default_price)} · {formatCbm(p.cbm_per_carton)}</p></div>
                  <Button size="sm" onClick={() => add.mutate(p)} disabled={add.isPending}>Add</Button>
                </div>
              );
            })}
            <Button variant="ghost" size="sm" onClick={() => setRecs(null)}>Clear suggestions</Button>
          </div>
        )}
      </div>
    </details>
  );
}
