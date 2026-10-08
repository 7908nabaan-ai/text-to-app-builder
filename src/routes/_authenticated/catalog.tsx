import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Search, Wand2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { recommendProducts, type Recommendation } from "@/lib/recommend.functions";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCbm, formatMoney } from "@/lib/calc";
import { ProductPhoto } from "@/components/product-photo";
import { getOrCreateDraftOrder, logOrderEvent } from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/catalog")({
  head: () => ({
    meta: [
      { title: "Product catalog — Sky Plus" },
      { name: "description", content: "Browse products by category and add cartons to your order." },
      { property: "og:title", content: "Product catalog — Sky Plus" },
      { property: "og:description", content: "Browse products and add cartons to your order." },
    ],
  }),
  component: CatalogPage,
});

function CatalogPage() {
  return (
    <Page title="Catalog" description="Add products to your container order.">
      {({ userId }) => <CatalogBody userId={userId} />}
    </Page>
  );
}

function CatalogBody({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", categoryId],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("*, categories(name)")
        .eq("is_active", true)
        .order("name");
      if (categoryId) query = query.eq("category_id", categoryId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const addLine = useMutation({
    mutationFn: async (product: (typeof products)[number]) => {
      const order = await getOrCreateDraftOrder(userId);
      const { data: existing } = await supabase
        .from("order_lines")
        .select("*")
        .eq("order_id", order.id)
        .eq("sku", product.sku)
        .maybeSingle();

      if (existing) {
        const next = existing.current_quantity + 1;
        const { error } = await supabase
          .from("order_lines")
          .update({ current_quantity: next, requested_quantity: existing.requested_quantity + 1 })
          .eq("id", existing.id);
        if (error) throw error;
        await logOrderEvent({
          order_id: order.id,
          event_type: "quantity_changed",
          actor_role: "customer",
          sku: product.sku,
          product_name: product.name,
          previous_quantity: existing.current_quantity,
          new_quantity: next,
        });
      } else {
        const { error } = await supabase.from("order_lines").insert({
          order_id: order.id,
          product_id: product.id,
          sku: product.sku,
          product_name: product.name,
          category_name: (product as { categories?: { name: string } | null }).categories?.name ?? null,
          image_path: product.image_path,
          unit: product.unit,
          cbm_per_carton: product.cbm_per_carton,
          catalog_price: product.default_price,
          negotiated_price: product.default_price,
          requested_quantity: 1,
          current_quantity: 1,
        });
        if (error) throw error;
        await logOrderEvent({
          order_id: order.id,
          event_type: "line_added",
          actor_role: "customer",
          sku: product.sku,
          product_name: product.name,
          new_quantity: 1,
        });
      }
      return order.id;
    },
    onSuccess: () => {
      toast.success("Added to your order");
      void queryClient.invalidateQueries({ queryKey: ["current-order"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const recommend = useServerFn(recommendProducts);
  const [need, setNeed] = useState("");
  const [recs, setRecs] = useState<{ summary: string; items: Recommendation[] } | null>(null);
  const ask = useMutation({
    mutationFn: () => recommend({ data: { need } }),
    onMutate: () => setCategoryId(null),
    onSuccess: (r) => setRecs(r),
    onError: (error: Error) => toast.error(error.message),
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const filtered = products.filter((product) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      product.name.toLowerCase().includes(term) || product.sku.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="flex items-center gap-2 font-medium">
            <Wand2 className="h-4 w-4 text-gold" /> Not sure what to order? Describe what you need.
          </p>
          <Textarea
            placeholder="e.g. Drinks and snacks for a small resort shop, mostly isotonic drinks and cakes"
            value={need}
            onChange={(e) => setNeed(e.target.value)}
          />
          <Button className="h-11" disabled={need.trim().length < 3 || ask.isPending} onClick={() => ask.mutate()}>
            {ask.isPending ? "Finding products…" : "Suggest products"}
          </Button>
          {recs && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{recs.summary}</p>
              {recs.items.length === 0 && <p className="text-sm">No matching products found.</p>}
              {recs.items.map((r) => {
                const product = byId.get(r.id);
                if (!product) return null;
                return (
                  <div key={r.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">{r.reason}</p>
                      <p className="stat-label">{formatMoney(product.default_price)} · {formatCbm(product.cbm_per_carton)}</p>
                    </div>
                    <Button size="sm" onClick={() => addLine.mutate(product)} disabled={addLine.isPending}>
                      Add
                    </Button>
                  </div>
                );
              })}
              <Button variant="ghost" size="sm" onClick={() => setRecs(null)}>Clear suggestions</Button>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="relative">
        <Search className="absolute top-3.5 left-3 h-4 w-4 text-muted-foreground" />
        <Input
          className="h-11 pl-9"
          placeholder="Search by name or SKU"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button
          size="sm"
          variant={categoryId === null ? "default" : "outline"}
          onClick={() => setCategoryId(null)}
        >
          All
        </Button>
        {categories.map((category) => (
          <Button
            key={category.id}
            size="sm"
            variant={categoryId === category.id ? "default" : "outline"}
            className="shrink-0"
            onClick={() => setCategoryId(category.id)}
          >
            {category.name}
          </Button>
        ))}
      </div>

      {isLoading ? null : filtered.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Sky Plus staff will publish the catalog shortly."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <Card key={product.id}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <ProductPhoto path={product.image_path} alt={product.name} />
                  <div className="flex-1">
                    <p className="font-medium">{product.name}</p>
                    <p className="stat-label">{product.sku}</p>
                  </div>
                  <Badge variant="secondary">{formatMoney(product.default_price)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatCbm(product.cbm_per_carton)} per {product.unit.toLowerCase()}
                </p>
                <Button
                  className="h-11 w-full"
                  onClick={() => addLine.mutate(product)}
                  disabled={addLine.isPending}
                >
                  Add to order
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Button variant="outline" className="h-11 w-full" onClick={() => navigate({ to: "/dashboard" })}>
        Go to my order
      </Button>
    </div>
  );
}
