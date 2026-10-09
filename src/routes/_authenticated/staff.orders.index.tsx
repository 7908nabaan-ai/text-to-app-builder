import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_LABELS } from "@/lib/orders";
import { useOrderSummaries } from "@/routes/_authenticated/orders.index";
import { useCurrency } from "@/lib/currency";
import { CurrencySwitch } from "@/components/ordering";
import { formatCbm } from "@/lib/calc";

export const Route = createFileRoute("/_authenticated/staff/orders/")({
  head: () => ({
    meta: [
      { title: "Orders — Sky Plus" },
      { name: "description", content: "All customer orders grouped by stage, from draft to completed." },
      { property: "og:title", content: "Orders — Sky Plus" },
      { property: "og:description", content: "Customer orders grouped by stage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffOrdersPage,
});

const GROUPS = [
  { key: "draft", label: "Draft", statuses: ["draft"] },
  { key: "submitted", label: "Submitted", statuses: ["submitted"] },
  { key: "negotiation", label: "Negotiation", statuses: ["under_review", "awaiting_customer", "customer_updated"] },
  { key: "confirmed", label: "Confirmed", statuses: ["confirmed"] },
  { key: "loading", label: "Loading", statuses: ["loading"] },
  { key: "shipped", label: "Shipped", statuses: ["shipped"] },
  { key: "completed", label: "Completed", statuses: ["completed"] },
] as const;
const ALL = GROUPS.flatMap((g) => g.statuses);

function StaffOrdersPage() {
  return (
    <Page title="Orders" actions={<CurrencySwitch />}>
      {({ isStaff }) => (isStaff ? <Body /> : <EmptyState title="Staff only" description="This page is for Sky Plus staff." />)}
    </Page>
  );
}

function Body() {
  const { money } = useCurrency();
  const [group, setGroup] = useState<string>("submitted");
  const [term, setTerm] = useState("");
  const { data = [] } = useOrderSummaries({ statuses: ALL });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => (await supabase.from("profiles").select("id, company_name, contact_name, shipping_country")).data ?? [],
  });
  const who = new Map(profiles.map((p) => [p.id, p]));
  const g = GROUPS.find((x) => x.key === group) ?? GROUPS[1];
  const t = term.trim().toLowerCase();
  const list = data.filter((o) => (g.statuses as readonly string[]).includes(o.status)).filter((o) => {
    if (!t) return true;
    const p = who.get(o.customer_id);
    return [o.order_number, p?.company_name, p?.contact_name].some((v) => v?.toLowerCase().includes(t));
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {GROUPS.map((x) => {
          const n = data.filter((o) => (x.statuses as readonly string[]).includes(o.status)).length;
          return <Button key={x.key} size="sm" variant={group === x.key ? "default" : "outline"} onClick={() => setGroup(x.key)}>{x.label} <span className="ml-1 rounded bg-background/20 px-1">{n}</span></Button>;
        })}
      </div>
      <Input className="h-10 max-w-sm" placeholder="Search order or customer" value={term} onChange={(e) => setTerm(e.target.value)} />
      {list.length === 0 ? <EmptyState title={`No ${g.label.toLowerCase()} orders`} /> : (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-160 text-left text-xs">
            <thead><tr><th>Order</th><th>Customer</th><th>Container</th><th>Cartons</th><th>CBM</th><th>Value</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>{list.map((o) => {
              const p = who.get(o.customer_id);
              return (
                <tr key={o.id}>
                  <td><Link to="/staff/orders/$orderId" params={{ orderId: o.id }} className="font-semibold text-primary">{o.order_number}</Link></td>
                  <td>{p?.company_name || p?.contact_name || "Customer"}</td>
                  <td>{o.container_name}</td><td>{o.cartons}</td><td>{formatCbm(o.cbm)}</td><td className="font-semibold">{money(o.value)}</td>
                  <td><Badge variant="secondary">{STATUS_LABELS[o.status]}</Badge></td>
                  <td>{new Date(o.updated_at).toLocaleDateString()}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
