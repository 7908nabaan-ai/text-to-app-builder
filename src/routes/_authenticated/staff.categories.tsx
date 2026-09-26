import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/staff/categories")({
  head: () => ({
    meta: [
      { title: "Categories — Sky Plus" },
      { name: "description", content: "Manage the product categories shown in the catalog." },
      { property: "og:title", content: "Categories — Sky Plus" },
      { property: "og:description", content: "Manage the product categories shown in the catalog." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CategoriesPage,
});

type Category = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function CategoriesPage() {
  return (
    <Page title="Categories" description="Groups used to organise the product catalog.">
      {({ isStaff }) =>
        isStaff ? (
          <CategoriesBody />
        ) : (
          <EmptyState title="Staff only" description="This page is for Sky Plus staff." />
        )
      }
    </Page>
  );
}

function CategoriesBody() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ["categories-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, is_active, sort_order")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data as Category[];
    },
  });

  const save = useMutation({
    mutationFn: async (values: Omit<Category, "id"> & { id?: string }) => {
      if (values.id) {
        const { error } = await supabase
          .from("categories")
          .update({
            name: values.name,
            slug: values.slug,
            is_active: values.is_active,
            sort_order: values.sort_order,
          })
          .eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories").insert({
          name: values.name,
          slug: values.slug,
          is_active: values.is_active,
          sort_order: values.sort_order,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Category saved");
      setOpen(false);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["categories-admin"] });
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (category: Category) => {
      const { error } = await supabase
        .from("categories")
        .update({ is_active: !category.is_active })
        .eq("id", category.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["categories-admin"] });
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    const slugInput = String(form.get("slug") ?? "").trim();
    save.mutate({
      id: editing?.id,
      name,
      slug: slugify(slugInput || name),
      sort_order: Number(form.get("sort_order") ?? 0),
      is_active: form.get("is_active") === "on",
    });
  };

  return (
    <div className="space-y-4">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
      >
        <DialogTrigger asChild>
          <Button className="h-11 w-full sm:w-auto">Add category</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" className="h-11" defaultValue={editing?.name ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">Short code</Label>
              <Input
                id="slug"
                name="slug"
                className="h-11"
                placeholder="auto from name"
                defaultValue={editing?.slug ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sort_order">Display order</Label>
              <Input
                id="sort_order"
                name="sort_order"
                type="number"
                className="h-11"
                defaultValue={editing?.sort_order ?? 0}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="is_active" name="is_active" defaultChecked={editing?.is_active ?? true} />
              <Label htmlFor="is_active">Visible in catalog</Label>
            </div>
            <DialogFooter>
              <Button type="submit" className="h-11 w-full" disabled={save.isPending}>
                Save category
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {data.length === 0 ? (
        <EmptyState title="No categories yet" description="Add your first category above." />
      ) : (
        <div className="space-y-3">
          {data.map((category) => (
            <Card key={category.id}>
              <CardContent className="flex items-center justify-between gap-3 pt-5">
                <div>
                  <p className="font-medium">{category.name}</p>
                  <p className="stat-label">
                    {category.slug} · order {category.sort_order}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={category.is_active}
                    onCheckedChange={() => toggleActive.mutate(category)}
                    aria-label="Visible in catalog"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(category);
                      setOpen(true);
                    }}
                  >
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
