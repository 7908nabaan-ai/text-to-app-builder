import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Page } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { formatCbm, formatMoney } from "@/lib/calc";

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
  );
}
