import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Container, Minus, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/page";
import { ProductPhoto } from "@/components/product-photo";
import { formatCbm, formatKg } from "@/lib/calc";
import { useCurrency } from "@/lib/currency";
import { STATUS_LABELS, addProductToOrder, createOrder, logOrderEvent, type OrderLine } from "@/lib/orders";
import { BottomTotals, LineStatus, OrderSidePanels } from "@/components/order-panels";
import { LiveOrderPanel, ProductTile, useCatalogProducts, useFavourites, type CatalogProduct } from "@/components/ordering";
import { cn } from "@/lib/utils";

type Line = OrderLine & { gross_weight_kg: number };

export function useContainerTypes() {
  return useQuery({
    queryKey: ["container-types-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("container_types").select("*").eq("is_active", true).order("sort_order").order("capacity_cbm");
      if (error) throw error;
      return data;
    },
  });
}

/** Step 1 of a new order: the container must be chosen before any product is added. */
export function ContainerPicker({ userId, onCreated }: { userId: string; onCreated: (orderId: string) => void }) {
  const qc = useQueryClient();
  const { data: containers = [] } = useContainerTypes();
  const create = useMutation({
    mutationFn: (containerId: string) => createOrder(userId, containerId),
    onSuccess: (order) => {
      toast.success(`New order ${order.order_number} started`);
      void qc.invalidateQueries({ queryKey: ["customer-orders"] });
      void qc.invalidateQueries({ queryKey: ["current-order"] });
      onCreated(order.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <div><h2 className="font-display text-xl font-bold">Select your container</h2><p className="text-sm text-muted-foreground">Choose a container first. Its volume and weight limits guide your order.</p></div>
      <div className="grid gap-3 sm:grid-cols-3">
        {containers.map((c) => (
          <button key={c.id} type="button" disabled={create.isPending} onClick={() => create.mutate(c.id)} className="rounded-md border-2 border-border bg-card p-5 text-left transition-colors hover:border-primary disabled:opacity-60">
            <Container className="mb-3 h-8 w-8 text-primary" />
            <p className="font-display text-lg font-bold">{c.name}</p>
            <p className="text-sm text-muted-foreground">Up to {formatCbm(Number(c.capacity_cbm))}</p>
            <p className="text-sm text-muted-foreground">Max {Number(c.max_weight_kg) ? formatKg(Number(c.max_weight_kg)) : "weight not set"}</p>
          </button>
        ))}
      </div>
      {containers.length === 0 && <EmptyState title="No containers available" description="Please contact Sky Plus." />}
    </div>
  );
}

/** Single-screen ordering: search, suggestions, lines and the live container panel. */
export function QuickOrder({ userId, orderId, onSelectOrder }: { userId: string; orderId?: string; onSelectOrder: (id: string | undefined) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { money } = useCurrency();
  const [term, setTerm] = useState("");
  const [tab, setTab] = useState<"favourites" | "recent" | "frequent" | "all">("all");
  const [newOrder, setNewOrder] = useState(false);
  const [mainId, setMainId] = useState<string | null>(null);
  const [deptId, setDeptId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const mains = categories.filter((c) => !c.parent_id);
  const depts = categories.filter((c) => c.parent_id === mainId);

  const { data: openOrders = [], isLoading } = useQuery({
    queryKey: ["customer-orders", userId, "editable"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").eq("customer_id", userId).in("status", ["draft", "awaiting_customer"]).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const order = openOrders.find((o) => o.id === orderId) ?? openOrders[0];

  const { data: lines = [] } = useQuery({
    queryKey: ["order-lines", order?.id],
    enabled: Boolean(order),
    queryFn: async () => {
      const { data, error } = await supabase.from("order_lines").select("*").eq("order_id", order!.id).order("created_at");
      if (error) throw error;
      return data as Line[];
    },
  });

  const { data: products = [] } = useCatalogProducts();
  const favs = useFavourites(userId);

  const { data: pastLines = [] } = useQuery({
    queryKey: ["past-lines", userId],
    queryFn: async () => {
      const { data: orders } = await supabase.from("orders").select("id").eq("customer_id", userId);
      const ids = (orders ?? []).map((o) => o.id);
      if (!ids.length) return [];
      const { data } = await supabase.from("order_lines").select("product_id, created_at").in("order_id", ids).order("created_at", { ascending: false }).limit(500);
      return data ?? [];
    },
  });

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const qtyBySku = new Map(lines.map((l) => [l.sku, l.current_quantity]));
  const lists = useMemo(() => {
    const recentIds = [...new Set(pastLines.map((l) => l.product_id).filter(Boolean) as string[])];
    const counts = new Map<string, number>();
    pastLines.forEach((l) => l.product_id && counts.set(l.product_id, (counts.get(l.product_id) ?? 0) + 1));
    const frequentIds = [...counts].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean).slice(0, 20) as CatalogProduct[];
    return { recent: pick(recentIds), frequent: pick(frequentIds), favourites: pick([...favs.ids]), all: products.filter((p) => {
      if (deptId) return p.category_id === deptId;
      if (mainId) { const ids = new Set([mainId, ...categories.filter((c) => c.parent_id === mainId).map((d) => d.id)]); return Boolean(p.category_id && ids.has(p.category_id)); }
      return true;
    }) };
  }, [pastLines, byId, favs.ids, products, mainId, deptId, categories]);

  const q = term.trim().toLowerCase();
  const matches = q ? products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 8) : [];

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["order-lines", order?.id] });
    void qc.invalidateQueries({ queryKey: ["current-order"] });
    void qc.invalidateQueries({ queryKey: ["order-activity"] });
  };

  const add = useMutation({
    mutationFn: (p: CatalogProduct) => addProductToOrder(order!, p),
    onSuccess: (_d, p) => { toast.success(`${p.name} added`); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setQty = useMutation({
    mutationFn: async ({ line, quantity }: { line: Line; quantity: number }) => {
      if (quantity <= 0) {
        const { error } = await supabase.from("order_lines").delete().eq("id", line.id);
        if (error) throw error;
        await logOrderEvent({ order_id: line.order_id, event_type: "line_removed", actor_role: "customer", sku: line.sku, product_name: line.product_name, previous_quantity: line.current_quantity, new_quantity: 0 });
        return;
      }
      const patch: { current_quantity: number; requested_quantity?: number } = { current_quantity: quantity };
      if (order?.status === "draft") patch.requested_quantity = quantity;
      const { error } = await supabase.from("order_lines").update(patch).eq("id", line.id);
      if (error) throw error;
      await logOrderEvent({ order_id: line.order_id, event_type: "quantity_changed", actor_role: "customer", sku: line.sku, product_name: line.product_name, previous_quantity: line.current_quantity, new_quantity: quantity });
    },
    onMutate: async ({ line, quantity }) => {
      // instant panel update
      qc.setQueryData<Line[]>(["order-lines", order?.id], (old) => (old ?? []).flatMap((l) => (l.id === line.id ? (quantity <= 0 ? [] : [{ ...l, current_quantity: quantity }]) : [l])));
    },
    onSettled: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!order) return;
      const next = order.status === "draft" ? "submitted" : "customer_updated";
      const { error } = await supabase.from("orders").update({ status: next }).eq("id", order.id);
      if (error) throw error;
      await logOrderEvent({ order_id: order.id, event_type: "status_changed", actor_role: "customer", previous_status: order.status, new_status: next });
    },
    onSuccess: () => {
      toast.success("Order sent to Sky Plus");
      void qc.invalidateQueries();
      void navigate({ to: "/orders/$orderId", params: { orderId: order!.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return null;
  if (!order || newOrder) {
    return (
      <div className="space-y-3">
        {newOrder && <Button variant="ghost" size="sm" onClick={() => setNewOrder(false)}>Back to current order</Button>}
        <ContainerPicker userId={userId} onCreated={(id) => { setNewOrder(false); onSelectOrder(id); }} />
      </div>
    );
  }

  const PAGE = 15;
  const shown = tab === "all" ? lists.all.slice(page * PAGE, (page + 1) * PAGE) : lists[tab];

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {openOrders.length > 1 && (
            <select aria-label="Order" className="h-9 rounded-md border border-input bg-card px-2 text-sm" value={order.id} onChange={(e) => onSelectOrder(e.target.value)}>
              {openOrders.map((o) => <option key={o.id} value={o.id}>{o.order_number} · {o.container_name ?? ""}</option>)}
            </select>
          )}
          <Badge variant="secondary">{STATUS_LABELS[order.status]}</Badge>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setNewOrder(true)}>New order</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input autoFocus className="h-11 pl-9" placeholder="Type a product name or SKU…" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search products" />
          {matches.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
              {matches.map((p) => (
                <li key={p.id} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-0">
                  <ProductPhoto path={p.image_path} alt={p.name} className="h-10 w-10" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{p.name}</p><p className="text-xs text-muted-foreground">{p.sku} · {p.unit} · {formatCbm(Number(p.cbm_per_carton))} · {money(Number(p.default_price))}</p></div>
                  <Button size="sm" disabled={add.isPending} onClick={() => add.mutate(p)}><Plus className="h-4 w-4" />Add{qtyBySku.get(p.sku) ? ` (${qtyBySku.get(p.sku)})` : ""}</Button>
                </li>
              ))}
            </ul>
          )}
          {q && matches.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No products match “{term}”.</p>}
        </div>


        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {([["all", "All products"], ["favourites", "Favourites"], ["recent", "Recently ordered"], ["frequent", "Frequently ordered"]] as const).map(([k, label]) => (
              <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => { setTab(k); setPage(0); }}>{label}</Button>
            ))}
          </div>
          {tab === "all" && (
            <div className="space-y-2">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <Button size="sm" variant={mainId === null ? "secondary" : "ghost"} onClick={() => { setMainId(null); setDeptId(null); setPage(0); }}>All categories</Button>
                {mains.map((m) => <Button key={m.id} size="sm" className="shrink-0" variant={mainId === m.id ? "secondary" : "ghost"} onClick={() => { setMainId(m.id); setDeptId(null); setPage(0); }}>{m.name}</Button>)}
              </div>
              {mainId && depts.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <Button size="sm" variant={deptId === null ? "outline" : "ghost"} className="h-7 text-xs" onClick={() => { setDeptId(null); setPage(0); }}>All {mains.find((m) => m.id === mainId)?.name}</Button>
                  {depts.map((d) => <Button key={d.id} size="sm" className="h-7 shrink-0 text-xs" variant={deptId === d.id ? "outline" : "ghost"} onClick={() => { setDeptId(d.id); setPage(0); }}>{d.name}</Button>)}
                </div>
              )}
            </div>
          )}
          {shown.length === 0 ? <p className="text-sm text-muted-foreground">{tab === "favourites" ? "Tap the heart on a product to save it here." : "Nothing here yet."}</p> : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {shown.map((p) => <ProductTile key={p.id} product={p} quantity={qtyBySku.get(p.sku)} adding={add.isPending} onAdd={() => add.mutate(p)} favourite={favs.ids.has(p.id)} onFavourite={() => favs.toggle(p.id)} />)}
            </div>
          )}
          {tab === "all" && lists.all.length > PAGE && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{page * PAGE + 1}–{Math.min((page + 1) * PAGE, lists.all.length)} of {lists.all.length}</span>
              <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= lists.all.length} onClick={() => setPage(page + 1)}>Next</Button></div>
            </div>
          )}
        </section>
        <section className="space-y-2">
          <h2 className="font-display text-lg font-bold">Current order</h2>
          {lines.length === 0 ? <EmptyState title="No products yet" description="Search above or pick from the lists below." /> : (
            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <table className="w-full min-w-160 text-left text-xs">
                <thead><tr><th>Product</th><th>Packing</th><th>Cartons</th><th>CBM</th><th>Weight</th><th>Unit price</th><th>Total</th><th>Status</th><th /></tr></thead>
                <tbody>{lines.map((l) => (
                  <tr key={l.id}>
                    <td><div className="flex items-center gap-2"><ProductPhoto path={l.image_path} alt={l.product_name} className="h-10 w-10" /><div className="min-w-28"><p className="font-semibold">{l.product_name}</p><p className="text-muted-foreground">{l.sku}</p></div></div></td>
                    <td>{l.unit}</td>
                    <td><div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty.mutate({ line: l, quantity: l.current_quantity - 1 })} aria-label={`Decrease ${l.product_name}`}><Minus /></Button>
                      <Input type="number" min={0} aria-label={`Cartons of ${l.product_name}`} className="h-7 w-16 px-1 text-center text-xs" key={`${l.id}-${l.current_quantity}`} defaultValue={l.current_quantity} onBlur={(e) => { const n = Math.max(0, Math.floor(Number(e.target.value) || 0)); if (n !== l.current_quantity) setQty.mutate({ line: l, quantity: n }); }} />
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty.mutate({ line: l, quantity: l.current_quantity + 1 })} aria-label={`Increase ${l.product_name}`}><Plus /></Button>
                    </div></td>
                    <td>{(Number(l.cbm_per_carton) * l.current_quantity).toFixed(3)}</td>
                    <td>{formatKg(Number(l.gross_weight_kg ?? 0) * l.current_quantity)}</td>
                    <td>{money(Number(l.negotiated_price))}</td>
                    <td className="font-semibold">{money(Number(l.negotiated_price) * l.current_quantity)}</td>
                    <td><LineStatus line={l} /></td>
                    <td><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setQty.mutate({ line: l, quantity: 0 })} aria-label={`Remove ${l.product_name}`}><Trash2 /></Button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
        <BottomTotals order={order} lines={lines} />
      </div>

      <div className="space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
        <LiveOrderPanel order={order} lines={lines} sticky={false}>
          <Button className={cn("h-11 w-full")} disabled={lines.length === 0 || submit.isPending} onClick={() => submit.mutate()}>
            {order.status === "draft" ? "Submit order" : "Send my response"}
          </Button>
        </LiveOrderPanel>
        <OrderSidePanels order={order} />
      </div>
    </div>
  );
}
