import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { CurrencySwitch, ProductTile, useCatalogProducts, useFavourites, type CatalogProduct } from "@/components/ordering";
import { addProductToOrder, getDraftOrder } from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/favourites")({
  head: () => ({
    meta: [
      { title: "Favourite products — Sky Plus" },
      { name: "description", content: "Your saved products, ready to add to your container order." },
      { property: "og:title", content: "Favourite products — Sky Plus" },
      { property: "og:description", content: "Saved products ready to order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FavouritesPage,
});

function FavouritesPage() {
  return <Page title="Favourite products" actions={<CurrencySwitch />}>{({ userId }) => <Body userId={userId} />}</Page>;
}

function Body({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: products = [] } = useCatalogProducts();
  const favs = useFavourites(userId);
  const list = products.filter((p) => favs.ids.has(p.id));
  const add = useMutation({
    mutationFn: async (p: CatalogProduct) => {
      const order = await getDraftOrder(userId);
      if (!order) throw new Error("Start a new order and choose a container first.");
      await addProductToOrder(order, p);
    },
    onSuccess: () => { toast.success("Added to your order"); void qc.invalidateQueries({ queryKey: ["order-lines"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (list.length === 0) return <div className="space-y-3"><EmptyState title="No favourites yet" description="Tap the heart on any product while ordering." /><Button asChild><Link to="/catalog" search={{ order: "" }}>Go to ordering</Link></Button></div>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {list.map((p) => <ProductTile key={p.id} product={p} onAdd={() => add.mutate(p)} adding={add.isPending} favourite onFavourite={() => favs.toggle(p.id)} />)}
    </div>
  );
}
