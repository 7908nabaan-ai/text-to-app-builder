import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCbm, formatMoney } from "@/lib/calc";
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

  const filtered = products.filter((product) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      product.name.toLowerCase().includes(term) || product.sku.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4">
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
                  <div>
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
