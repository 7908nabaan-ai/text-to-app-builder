import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCbm, formatMoney } from "@/lib/calc";

export const Route = createFileRoute("/_authenticated/staff/products")({
  head: () => ({
    meta: [
      { title: "Products — Sky Plus" },
      { name: "description", content: "Manage catalog products, carton volume and list prices." },
      { property: "og:title", content: "Products — Sky Plus" },
      {
        property: "og:description",
        content: "Manage catalog products, carton volume and list prices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsPage,
});

type Product = {
  id: string;
  sku: string;
  name: string;
  category_id: string | null;
  description: string | null;
  carton_length: number | null;
  carton_width: number | null;
  carton_height: number | null;
  cbm_per_carton: number;
  default_price: number;
  unit: string;
  is_active: boolean;
};

function ProductsPage() {
  return (
    <Page title="Products" description="Catalog items customers can order.">
      {({ isStaff }) =>
        isStaff ? (
          <ProductsBody />
        ) : (
          <EmptyState title="Staff only" description="This page is for Sky Plus staff." />
        )
      }
    </Page>
  );
}

function ProductsBody() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");

  const { data: products = [] } = useQuery({
    queryKey: ["products-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, sku, name, category_id, description, carton_length, carton_width, carton_height, cbm_per_carton, default_price, unit, is_active",
        )
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (values: {
      id?: string;
      sku: string;
      name: string;
      category_id: string | null;
      description: string | null;
      carton_length: number | null;
      carton_width: number | null;
      carton_height: number | null;
      cbm_per_carton: number;
      default_price: number;
      unit: string;
      is_active: boolean;
    }) => {
      const { id, ...payload } = values;
      if (id) {
        const { error } = await supabase.from("products").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Product saved");
      setOpen(false);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["products-admin"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog-products"] });
    },
    onError: (error: Error) =>
      toast.error(
        error.message.includes("duplicate") ? "That product code already exists." : error.message,
      ),
  });

  const toggleActive = useMutation({
    mutationFn: async (product: Product) => {
      const { error } = await supabase
        .from("products")
        .update({ is_active: !product.is_active })
        .eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products-admin"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog-products"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const num = (key: string) => {
      const raw = String(form.get(key) ?? "").trim();
      return raw === "" ? null : Number(raw);
    };
    const sku = String(form.get("sku") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    if (!sku || !name) {
      toast.error("Product code and name are required");
      return;
    }
    const length = num("carton_length");
    const width = num("carton_width");
    const height = num("carton_height");
    const derivedCbm =
      length && width && height ? Number(((length * width * height) / 1_000_000).toFixed(4)) : null;
    const cbm = num("cbm_per_carton") ?? derivedCbm;
    if (!cbm || cbm <= 0) {
      toast.error("Enter the carton volume or its dimensions");
      return;
    }
    const price = num("default_price");
    if (price === null || price < 0) {
      toast.error("Enter a valid price");
      return;
    }
    save.mutate({
      id: editing?.id,
      sku,
      name,
      category_id: categoryId === "none" ? null : categoryId,
      description: String(form.get("description") ?? "").trim() || null,
      carton_length: length,
      carton_width: width,
      carton_height: height,
      cbm_per_carton: cbm,
      default_price: price,
      unit: String(form.get("unit") ?? "Carton").trim() || "Carton",
      is_active: form.get("is_active") === "on",
    });
  };

  const openFor = (product: Product | null) => {
    setEditing(product);
    setCategoryId(product?.category_id ?? "none");
    setOpen(true);
  };

  const term = search.trim().toLowerCase();
  const filtered = products.filter(
    (product) =>
      !term ||
      product.name.toLowerCase().includes(term) ||
      product.sku.toLowerCase().includes(term),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          className="h-11"
          placeholder="Search products"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button className="h-11 sm:w-auto" onClick={() => openFor(null)}>
              Add product
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sku">Product code</Label>
                  <Input id="sku" name="sku" className="h-11" defaultValue={editing?.sku ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unit">Unit</Label>
                  <Input
                    id="unit"
                    name="unit"
                    className="h-11"
                    defaultValue={editing?.unit ?? "Carton"}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" className="h-11" defaultValue={editing?.name ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="carton_length">Length cm</Label>
                  <Input
                    id="carton_length"
                    name="carton_length"
                    type="number"
                    step="0.1"
                    className="h-11"
                    defaultValue={editing?.carton_length ?? ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="carton_width">Width cm</Label>
                  <Input
                    id="carton_width"
                    name="carton_width"
                    type="number"
                    step="0.1"
                    className="h-11"
                    defaultValue={editing?.carton_width ?? ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="carton_height">Height cm</Label>
                  <Input
                    id="carton_height"
                    name="carton_height"
                    type="number"
                    step="0.1"
                    className="h-11"
                    defaultValue={editing?.carton_height ?? ""}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cbm_per_carton">Volume per carton (CBM)</Label>
                  <Input
                    id="cbm_per_carton"
                    name="cbm_per_carton"
                    type="number"
                    step="0.0001"
                    className="h-11"
                    placeholder="auto from dimensions"
                    defaultValue={editing?.cbm_per_carton ?? ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="default_price">List price</Label>
                  <Input
                    id="default_price"
                    name="default_price"
                    type="number"
                    step="0.01"
                    className="h-11"
                    defaultValue={editing?.default_price ?? ""}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={editing?.description ?? ""}
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="is_active"
                  name="is_active"
                  defaultChecked={editing?.is_active ?? true}
                />
                <Label htmlFor="is_active">Available to customers</Label>
              </div>
              <DialogFooter>
                <Button type="submit" className="h-11 w-full" disabled={save.isPending}>
                  Save product
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No products yet" description="Add your first product above." />
      ) : (
        <div className="space-y-3">
          {filtered.map((product) => (
            <Card key={product.id}>
              <CardContent className="flex items-start justify-between gap-3 pt-5">
                <div>
                  <p className="font-medium">{product.name}</p>
                  <p className="stat-label">
                    {product.sku} · {formatCbm(Number(product.cbm_per_carton))} ·{" "}
                    {formatMoney(Number(product.default_price))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={product.is_active}
                    onCheckedChange={() => toggleActive.mutate(product)}
                    aria-label="Available to customers"
                  />
                  <Button variant="outline" size="sm" onClick={() => openFor(product)}>
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
