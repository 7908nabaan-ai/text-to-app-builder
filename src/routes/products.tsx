import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PublicLayout } from "@/components/public-layout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCbm, formatMoney } from "@/lib/calc";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "Product Catalog — Sky Plus" },
      { name: "description", content: "Browse the Sky Plus wholesale catalog: products, carton volumes and list prices." },
      { property: "og:title", content: "Product Catalog — Sky Plus" },
      { property: "og:description", content: "Browse wholesale products, carton volumes and list prices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicCatalog,
});

function PublicCatalog() {
  const [search, setSearch] = useState("");
  const [mainId, setMainId] = useState<string | null>(null);
  const [deptId, setDeptId] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["public-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, parent_id")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const mains = categories.filter((c) => !c.parent_id);
  const depts = categories.filter((c) => c.parent_id === mainId);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["public-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, sku, name, description, category_id, cbm_per_carton, default_price, unit")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const term = search.trim().toLowerCase();
  const shown = products.filter(
    (p) =>
      (!categoryId || p.category_id === categoryId) &&
      (!term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)),
  );

  return (
    <PublicLayout>
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="font-display text-4xl font-bold">Product catalog</h1>
        <p className="mt-2 text-muted-foreground">
          Browse freely. Sign in to add products to a container order.
        </p>
        <div className="relative mt-6">
          <Search className="absolute top-3.5 left-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            placeholder="Search by name or code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant={categoryId ? "outline" : "default"} onClick={() => setCategoryId(null)}>
            All
          </Button>
          {categories.map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={categoryId === c.id ? "default" : "outline"}
              onClick={() => setCategoryId(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>
        {isLoading ? (
          <p className="mt-8 text-muted-foreground">Loading products…</p>
        ) : shown.length === 0 ? (
          <p className="mt-8 text-muted-foreground">No products to show yet.</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => (
              <div key={p.id} className="flex flex-col rounded-lg border border-border bg-card p-5">
                <Badge variant="secondary" className="w-fit">{p.sku}</Badge>
                <h2 className="mt-3 font-display text-lg font-semibold">{p.name}</h2>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                )}
                <div className="mt-auto flex items-end justify-between pt-4">
                  <span className="stat-label">{formatCbm(Number(p.cbm_per_carton))} / {p.unit}</span>
                  <span className="font-semibold text-primary">{formatMoney(Number(p.default_price))}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-10 rounded-lg bg-secondary p-6 text-center">
          <p className="font-medium">Ready to order a container?</p>
          <Button asChild className="mt-3"><Link to="/auth">Sign in to order</Link></Button>
        </div>
      </section>
    </PublicLayout>
  );
}
