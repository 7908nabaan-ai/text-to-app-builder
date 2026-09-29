import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Page } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { formatCbm, formatMoney } from "@/lib/calc";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadExcel, downloadPdf } from "@/lib/exports";
import { STATUS_LABELS } from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Sky Plus" },
      { name: "description", content: "Order volumes, shipped value and payments at a glance." },
      { property: "og:title", content: "Reports — Sky Plus" },
      { property: "og:description", content: "Order volumes, shipped value and payments." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <Page title="Reports" description="Totals based on confirmed and shipped orders.">
      {() => <ReportsBody />}
    </Page>
  );
}

function ReportsBody() {
  const { data } = useQuery({
    queryKey: ["reports-summary"],
    queryFn: async () => {
      const [orders, invoices, payments] = await Promise.all([
        supabase.from("orders").select("id, status"),
        supabase.from("invoices").select("total_value, total_cbm, state"),
        supabase.from("payments").select("amount, status"),
      ]);
      if (orders.error) throw orders.error;
      if (invoices.error) throw invoices.error;
      if (payments.error) throw payments.error;

      const current = (invoices.data ?? []).filter((i) => i.state === "current");
      return {
        orderCount: orders.data?.length ?? 0,
        shipped: (orders.data ?? []).filter((o) => o.status === "shipped" || o.status === "completed")
          .length,
        invoicedValue: current.reduce((sum, i) => sum + Number(i.total_value), 0),
        invoicedCbm: current.reduce((sum, i) => sum + Number(i.total_cbm), 0),
        paid: (payments.data ?? [])
          .filter((p) => p.status === "confirmed")
          .reduce((sum, p) => sum + Number(p.amount), 0),
      };
    },
  });

  const stats = [
    { label: "Orders", value: String(data?.orderCount ?? 0) },
    { label: "Shipped containers", value: String(data?.shipped ?? 0) },
    { label: "Invoiced value", value: formatMoney(data?.invoicedValue ?? 0) },
    { label: "Invoiced volume", value: formatCbm(data?.invoicedCbm ?? 0) },
    { label: "Payments received", value: formatMoney(data?.paid ?? 0) },
    {
      label: "Outstanding balance",
      value: formatMoney((data?.invoicedValue ?? 0) - (data?.paid ?? 0)),
    },
  ];

  return (
    <div className="space-y-4">
    <ReportExports />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="pt-5">
            <p className="stat-label">{stat.label}</p>
            <p className="mt-1 font-display text-2xl font-bold">{stat.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
    </div>
  );
}

function ReportExports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  const build = async () => {
    let q = supabase
      .from("orders")
      .select("id, order_number, status, created_at, shipped_at, customer_id, container_capacity_cbm")
      .order("created_at", { ascending: false });
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", `${to}T23:59:59`);
    const { data: orders, error } = await q;
    if (error) throw error;
    const ids = (orders ?? []).map((o) => o.id);
    const safe = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
    const [lines, pays, profs] = await Promise.all([
      supabase.from("order_lines").select("order_id, sku, product_name, current_quantity, final_quantity, negotiated_price, cbm_per_carton").in("order_id", safe),
      supabase.from("payments").select("order_id, amount, status, paid_at, method, reference").in("order_id", safe),
      supabase.from("profiles").select("id, company_name, contact_name, email"),
    ]);
    const who = new Map((profs.data ?? []).map((p) => [p.id, p.company_name || p.contact_name || p.email || ""]));
    const orderNo = new Map((orders ?? []).map((o) => [o.id, o.order_number]));
    const orderRows = (orders ?? []).map((o) => {
      const ls = (lines.data ?? []).filter((l) => l.order_id === o.id);
      const value = ls.reduce((s, l) => s + Number(l.negotiated_price) * (l.final_quantity ?? l.current_quantity), 0);
      const cbm = ls.reduce((s, l) => s + Number(l.cbm_per_carton) * (l.final_quantity ?? l.current_quantity), 0);
      const paid = (pays.data ?? []).filter((p) => p.order_id === o.id && p.status === "confirmed").reduce((s, p) => s + Number(p.amount), 0);
      const payStatus = paid === 0 ? "Unpaid" : paid > value ? "Overpaid" : paid >= value ? "Paid" : "Partly paid";
      return [o.order_number, who.get(o.customer_id) ?? "", STATUS_LABELS[o.status] ?? o.status, new Date(o.created_at).toLocaleDateString(), o.shipped_at ? new Date(o.shipped_at).toLocaleDateString() : "", Number(cbm.toFixed(3)), Number(value.toFixed(2)), Number(paid.toFixed(2)), Number((value - paid).toFixed(2)), payStatus];
    });
    const productMap = new Map<string, { name: string; qty: number; value: number }>();
    for (const l of lines.data ?? []) {
      const q2 = l.final_quantity ?? l.current_quantity;
      const e = productMap.get(l.sku) ?? { name: l.product_name, qty: 0, value: 0 };
      e.qty += q2; e.value += q2 * Number(l.negotiated_price);
      productMap.set(l.sku, e);
    }
    return [
      { title: "Orders", head: ["Order", "Customer", "Status", "Created", "Shipped", "CBM", "Value", "Paid", "Balance", "Payment status"], rows: orderRows },
      { title: "Products", head: ["Code", "Product", "Quantity", "Value"], rows: [...productMap].map(([sku, e]) => [sku, e.name, e.qty, Number(e.value.toFixed(2))]) },
      { title: "Payments", head: ["Order", "Date", "Amount", "Method", "Reference", "Status"], rows: (pays.data ?? []).map((p) => [orderNo.get(p.order_id) ?? "", new Date(p.paid_at).toLocaleDateString(), Number(p.amount), p.method ?? "", p.reference ?? "", p.status]) },
    ];
  };

  const run = async (kind: "pdf" | "xlsx") => {
    setBusy(true);
    try {
      const tables = await build();
      const name = `sky-plus-report-${from || "all"}-${to || "now"}`;
      if (kind === "xlsx") downloadExcel(`${name}.xlsx`, tables);
      else downloadPdf(`${name}.pdf`, { title: "Report", subtitle: [`Period: ${from || "start"} to ${to || "today"}`], tables });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 pt-5">
        <div className="space-y-1"><Label htmlFor="from">From</Label><Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="to">To</Label><Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button variant="outline" disabled={busy} onClick={() => void run("xlsx")}>Download Excel</Button>
        <Button variant="outline" disabled={busy} onClick={() => void run("pdf")}>Download PDF</Button>
      </CardContent>
    </Card>
  );
}
