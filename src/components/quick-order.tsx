import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Container, MessageCircle, Minus, Plus, Search, Trash2 } from "lucide-react";
import bannerImage from "@/assets/catalog-warehouse.jpg";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/page";
import { ProductPhoto } from "@/components/product-photo";
import { formatCbm, formatKg } from "@/lib/calc";
import { useCurrency } from "@/lib/currency";
import { STATUS_LABELS, addProductToOrder, createOrder, logOrderEvent, type OrderLine } from "@/lib/orders";
import { LineStatus, NegotiationChat, OrderHeaderCard, RecentChanges, lineStatus } from "@/components/order-panels";
import { LiveOrderPanel, ProductTile, orderLoad, useCatalogProducts, useFavourites, type CatalogProduct } from "@/components/ordering";
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
export function QuickOrder({ userId, orderId, onSelectOrder }: { userId: string; orderId?: string | undefined; onSelectOrder: (id: string | undefined) => void }) {
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

  const load = orderLoad(order, lines);
  const activeMain = mains.find((m) => m.id === mainId);
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="min-w-0 space-y-4">
        <div className="relative overflow-hidden rounded-md bg-sidebar text-sidebar-foreground">
          <img src={bannerImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
          <div className="relative px-6 py-5">
            <p className="font-display text-lg font-bold uppercase">Quality products</p>
            <p className="font-display text-2xl font-bold uppercase">For a brighter tomorrow</p>
            <p className="mt-1 text-xs uppercase tracking-wide">{mains.map((m) => m.name).join("  |  ") || "Food  |  Non-food"}  |  And more</p>
          </div>
        </div>

        <section className="space-y-3 rounded-md border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Home <span className="mx-1">›</span> <span className="text-primary">{activeMain?.name ?? "All products"}</span></p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-bold">{depts.find((d) => d.id === deptId)?.name ?? activeMain?.name ?? "All products"}</h2>
            {openOrders.length > 1 && (
              <select aria-label="Order" className="ml-auto h-9 rounded-md border border-input bg-card px-2 text-sm" value={order.id} onChange={(e) => onSelectOrder(e.target.value)}>
                {openOrders.map((o) => <option key={o.id} value={o.id}>{o.order_number} · {o.container_name ?? ""}</option>)}
              </select>
            )}
            <Button size="sm" variant="outline" className={openOrders.length > 1 ? "" : "ml-auto"} onClick={() => setNewOrder(true)}>New order</Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="h-10 pl-9" placeholder="Type a product name or SKU…" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search products" />
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
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={tab === "all" && mainId === null ? "default" : "secondary"} onClick={() => { setTab("all"); setMainId(null); setDeptId(null); setPage(0); }}>All</Button>
            {mains.map((m) => <Button key={m.id} size="sm" variant={tab === "all" && mainId === m.id ? "default" : "secondary"} onClick={() => { setTab("all"); setMainId(m.id); setDeptId(null); setPage(0); }}>{m.name}</Button>)}
            <select aria-label="Show" className="ml-auto h-9 rounded-md border border-input bg-card px-2 text-sm" value={tab} onChange={(e) => { setTab(e.target.value as typeof tab); setPage(0); }}>
              <option value="all">Show: All products</option>
              <option value="favourites">Show: Favourites</option>
              <option value="recent">Show: Recently ordered</option>
              <option value="frequent">Show: Frequently ordered</option>
            </select>
          </div>
          {tab === "all" && mainId && depts.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <Button size="sm" variant={deptId === null ? "outline" : "ghost"} className="h-7 text-xs" onClick={() => { setDeptId(null); setPage(0); }}>All {activeMain?.name}</Button>
              {depts.map((d) => <Button key={d.id} size="sm" className="h-7 shrink-0 text-xs" variant={deptId === d.id ? "outline" : "ghost"} onClick={() => { setDeptId(d.id); setPage(0); }}>{d.name}</Button>)}
            </div>
          )}
          {shown.length === 0 ? <p className="text-sm text-muted-foreground">{tab === "favourites" ? "Tap the heart on a product to save it here." : "Nothing here yet."}</p> : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
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

        <section className="space-y-3 rounded-md border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-lg font-bold">Current Order</h2>
            <span className="ml-auto text-sm text-muted-foreground">Container Type:</span>
            <span className="rounded-md border border-input px-3 py-1.5 text-sm font-medium">{order.container_name ?? "—"}</span>
            <Button size="sm" variant="outline" onClick={() => document.querySelector<HTMLInputElement>('input[aria-label="Search products"]')?.focus()}><Plus className="h-4 w-4" />Add More Products</Button>
          </div>
          {lines.length === 0 ? <EmptyState title="No products yet" description="Search or tap Add on a product above." /> : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-200 text-left text-xs">
                <thead className="bg-muted/60"><tr><th className="w-10">No.</th><th>Product</th><th>Packing</th><th className="text-center">Qty (CTN)</th><th>CBM / CTN</th><th>Total CBM</th><th>Unit Price</th><th className="text-right">Total</th><th>Status</th><th className="text-center">Action</th></tr></thead>
                <tbody>{lines.map((l, i) => {
                  const st = lineStatus(l).label;
                  return (
                  <tr key={l.id}>
                    <td>{i + 1}</td>
                    <td><div className="flex items-center gap-2"><ProductPhoto path={l.image_path} alt={l.product_name} className="h-8 w-8" /><div className="min-w-28"><p className="font-medium">{l.product_name}</p><p className="text-[10px] text-muted-foreground">{l.sku}</p></div></div></td>
                    <td>{l.unit}</td>
                    <td><div className={cn("mx-auto flex w-fit items-center rounded-md border border-input", st.startsWith("Changed") && "bg-primary/10", st === "Pre-order" && "bg-gold/10")}>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setQty.mutate({ line: l, quantity: l.current_quantity - 1 })} aria-label={`Decrease ${l.product_name}`}><Minus /></Button>
                      <Input type="number" min={0} aria-label={`Cartons of ${l.product_name}`} className="h-7 w-14 border-0 bg-transparent px-1 text-center text-xs shadow-none" key={`${l.id}-${l.current_quantity}`} defaultValue={l.current_quantity} onBlur={(e) => { const n = Math.max(0, Math.floor(Number(e.target.value) || 0)); if (n !== l.current_quantity) setQty.mutate({ line: l, quantity: n }); }} />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setQty.mutate({ line: l, quantity: l.current_quantity + 1 })} aria-label={`Increase ${l.product_name}`}><Plus /></Button>
                    </div></td>
                    <td>{Number(l.cbm_per_carton).toFixed(3)}</td>
                    <td>{(Number(l.cbm_per_carton) * l.current_quantity).toFixed(2)}</td>
                    <td>{money(Number(l.negotiated_price))}</td>
                    <td className="text-right font-semibold">{money(Number(l.negotiated_price) * l.current_quantity)}</td>
                    <td><LineStatus line={l} /></td>
                    <td className="text-center"><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setQty.mutate({ line: l, quantity: 0 })} aria-label={`Remove ${l.product_name}`}><Trash2 /></Button></td>
                  </tr>
                ); })}</tbody>
              </table>
            </div>
          )}
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px]">
              {([["bg-success", "Available / OK"], ["bg-primary", "Changed by Sky Plus"], ["bg-gold", "Pre-order / Limited"], ["bg-destructive", "Removed / Not available"]] as const).map(([c, label]) => (
                <span key={label} className="flex items-center gap-1.5"><span className={cn("h-4 w-4 rounded-sm", c)} />{label}</span>
              ))}
            </div>
            <dl className="w-full max-w-sm divide-y divide-border rounded-md border border-border text-xs">
              {[["Total Cartons", `${load.totalCartons} CTN`], ["Total CBM", `${load.totalCbm.toFixed(2)} / ${load.capacityCbm.toFixed(1)} CBM`], ["Total Weight (est.)", formatKg(load.totalWeightKg)], ["Total Value", money(load.totalValue)]].map(([k, v]) => (
                <div key={k} className="grid grid-cols-2"><dt className="bg-muted/60 px-3 py-2 font-semibold">{k}</dt><dd className="px-3 py-2 text-center font-bold">{v}</dd></div>
              ))}
            </dl>
          </div>
          {(load.isOverCapacity || load.isOverWeight) && <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">Over the container {load.isOverCapacity ? "volume" : "weight"} limit. You can still submit — Sky Plus will review it with you.</p>}
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button variant="outline" disabled={lines.length === 0 || setQty.isPending} onClick={() => { if (confirm("Remove all products from this order?")) lines.forEach((l) => setQty.mutate({ line: l, quantity: 0 })); }}><Trash2 className="h-4 w-4" />Clear Order</Button>
            <Button variant="outline" className="ml-auto border-primary text-primary" onClick={() => toast.success("Order saved — changes are saved automatically")}>Save Order</Button>
            <Button disabled={lines.length === 0 || submit.isPending} onClick={() => submit.mutate()}>{order.status === "draft" ? "Submit to Sky Plus" : "Send my response"}</Button>
            <Button variant="success" onClick={() => document.getElementById("order-chat")?.scrollIntoView({ behavior: "smooth" })}><MessageCircle className="h-4 w-4" />Message Sky Plus</Button>
          </div>
        </section>
      </div>

      <div className="space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
        <OrderHeaderCard order={order} statusLabel={STATUS_LABELS[order.status]} />
        <NegotiationChat orderId={order.id} compact />
        <RecentChanges orderId={order.id} />
        <LiveOrderPanel order={order} lines={lines} sticky={false} />
      </div>
    </div>
  );
}
