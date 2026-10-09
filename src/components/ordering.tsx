import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Heart, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ProductPhoto } from "@/components/product-photo";
import { calcLoad, formatCbm, formatKg } from "@/lib/calc";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

export type CatalogProduct = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  image_path: string | null;
  cbm_per_carton: number;
  gross_weight_kg: number | null;
  default_price: number;
  category_id: string | null;
  categories?: { name: string } | null;
};

/** Active catalogue, shared cache across catalogue, quick order and favourites. */
export function useCatalogProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*, categories(name)").eq("is_active", true).order("name");
      if (error) throw error;
      return data as unknown as CatalogProduct[];
    },
  });
}

export function useFavourites(userId: string) {
  const qc = useQueryClient();
  const { data: ids = [] } = useQuery({
    queryKey: ["favourites", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("favourite_products").select("product_id").eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map((r) => r.product_id);
    },
  });
  const set = new Set(ids);
  const toggle = useMutation({
    mutationFn: async (productId: string) => {
      if (set.has(productId)) {
        const { error } = await supabase.from("favourite_products").delete().eq("user_id", userId).eq("product_id", productId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("favourite_products").insert({ user_id: userId, product_id: productId });
        if (error) throw error;
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["favourites", userId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  return { ids: set, toggle: (id: string) => toggle.mutate(id) };
}

export function CurrencySwitch({ className }: { className?: string }) {
  const { currency, setCurrency } = useCurrency();
  return (
    <div className={cn("inline-flex rounded-md border border-border bg-card p-0.5", className)} role="group" aria-label="Display currency">
      {(["USD", "MYR"] as const).map((c) => (
        <button key={c} type="button" onClick={() => setCurrency(c)} className={cn("rounded px-2.5 py-1 text-xs font-semibold", currency === c ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
          {c}
        </button>
      ))}
    </div>
  );
}

export function ProductTile({ product, onAdd, adding, favourite, onFavourite, quantity }: {
  product: CatalogProduct;
  onAdd?: () => void;
  adding?: boolean;
  favourite?: boolean;
  onFavourite?: () => void;
  quantity?: number | undefined;
}) {
  const { usd, myr } = useCurrency();
  return (
    <div className="relative flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card">
      {onFavourite && (
        <button type="button" onClick={onFavourite} aria-label={favourite ? `Remove ${product.name} from favourites` : `Add ${product.name} to favourites`} className="absolute right-1.5 top-1.5 z-10 rounded-full bg-card/90 p-1.5">
          <Heart className={cn("h-3.5 w-3.5", favourite ? "fill-destructive text-destructive" : "text-muted-foreground")} />
        </button>
      )}
      <ProductPhoto path={product.image_path} alt={product.name} className="h-32 w-full rounded-none bg-muted" />
      <div className="flex flex-1 flex-col gap-1 p-2">
        <p className="line-clamp-2 min-h-8 text-xs font-semibold leading-snug">{product.name}</p>
        <p className="truncate text-[10px] text-muted-foreground">{product.sku} · {product.unit}</p>
        <p className="text-[10px] text-muted-foreground">{formatCbm(Number(product.cbm_per_carton))} · {product.gross_weight_kg ? formatKg(Number(product.gross_weight_kg)) : "weight —"}</p>
        <p className="text-sm font-bold">{usd(Number(product.default_price))}</p>
        <p className="-mt-1 text-[10px] text-muted-foreground">{myr(Number(product.default_price))}</p>
        {onAdd && (
          <Button size="sm" className="mt-auto h-8 w-full text-xs" onClick={onAdd} disabled={adding}>
            <Plus className="h-3.5 w-3.5" />{quantity ? `Add (${quantity} in order)` : "Add"}
          </Button>
        )}
      </div>
    </div>
  );
}

export type PanelOrder = {
  order_number: string;
  container_name: string | null;
  container_capacity_cbm: number;
  container_max_weight_kg: number | null;
  container_warning_percent: number | null;
};
export type PanelLine = { cbm_per_carton: number; gross_weight_kg?: number | null; negotiated_price: number; current_quantity: number; final_quantity: number | null };

export function orderLoad(order: PanelOrder, lines: PanelLine[]) {
  return calcLoad(
    lines.map((l) => ({ quantity: l.final_quantity ?? l.current_quantity, cbmPerCarton: Number(l.cbm_per_carton), weightKg: Number(l.gross_weight_kg ?? 0), price: Number(l.negotiated_price) })),
    { capacityCbm: Number(order.container_capacity_cbm), maxWeightKg: Number(order.container_max_weight_kg ?? 0), warningPercent: Number(order.container_warning_percent ?? 90) },
  );
}

/** Always-visible container summary; updates as soon as the order lines change. */
export function LiveOrderPanel({ order, lines, children, sticky = true }: { order: PanelOrder; lines: PanelLine[]; children?: React.ReactNode; sticky?: boolean }) {
  const { usd, myr } = useCurrency();
  const t = orderLoad(order, lines);
  const row = (label: string, value: string, strong = false) => (
    <div className="flex justify-between gap-2 text-xs"><span className="text-muted-foreground">{label}</span><span className={strong ? "font-bold" : "font-semibold"}>{value}</span></div>
  );
  return (
    <aside className={cn("space-y-3 rounded-md border border-border bg-card p-4", sticky && "xl:sticky xl:top-20")} aria-label="Live order summary">
      <div className="flex items-start justify-between gap-2">
        <div><p className="stat-label">Order {order.order_number}</p><p className="font-display text-lg font-bold">{order.container_name ?? "Container"}</p></div>
        <CurrencySwitch />
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-semibold"><span>Volume</span><span>{t.utilizationPercent.toFixed(1)}%</span></div>
        <Progress value={Math.min(t.utilizationPercent, 100)} className={t.isOverCapacity ? "[&>div]:bg-destructive" : t.cbmNearLimit ? "[&>div]:bg-gold" : ""} />
        {row("Maximum CBM", formatCbm(t.capacityCbm))}
        {row("Used CBM", formatCbm(t.totalCbm))}
        {row(t.isOverCapacity ? "Over by" : "Remaining CBM", formatCbm(t.isOverCapacity ? t.exceededCbm : t.remainingCbm))}
      </div>
      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="flex justify-between text-xs font-semibold"><span>Gross weight</span><span>{t.maxWeightKg ? `${t.weightPercent.toFixed(1)}%` : "—"}</span></div>
        <Progress value={Math.min(t.weightPercent, 100)} className={t.isOverWeight ? "[&>div]:bg-destructive" : t.weightNearLimit ? "[&>div]:bg-gold" : ""} />
        {row("Maximum weight", t.maxWeightKg ? formatKg(t.maxWeightKg) : "Not set")}
        {row("Current weight", formatKg(t.totalWeightKg))}
        {row("Remaining weight", t.maxWeightKg ? formatKg(t.remainingWeightKg) : "—")}
      </div>
      <div className="space-y-1.5 border-t border-border pt-3">
        {row("Total cartons", String(t.totalCartons))}
        {row("Total products", String(t.totalProducts))}
        {row("USD total", usd(t.totalValue), true)}
        {row("MYR total", myr(t.totalValue), true)}
      </div>
      {(t.isOverCapacity || t.isOverWeight || t.cbmNearLimit || t.weightNearLimit) && (
        <p className={cn("flex gap-2 rounded-md p-2 text-xs", t.isOverCapacity || t.isOverWeight ? "bg-destructive/10 text-destructive" : "bg-gold/15 text-foreground")}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {t.isOverCapacity || t.isOverWeight
            ? `Over the container ${t.isOverCapacity && t.isOverWeight ? "volume and weight" : t.isOverCapacity ? "volume" : "weight"} limit. You can still submit — Sky Plus will review it with you.`
            : "Close to the container limit."}
        </p>
      )}
      {children}
    </aside>
  );
}
