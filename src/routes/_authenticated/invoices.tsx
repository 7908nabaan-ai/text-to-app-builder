import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/calc";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — Sky Plus" },
      { name: "description", content: "Proforma and commercial invoices with balances." },
      { property: "og:title", content: "Invoices — Sky Plus" },
      { property: "og:description", content: "Proforma and commercial invoices with balances." },
    ],
  }),
  component: InvoicesPage,
});

function InvoicesPage() {
  return (
    <Page title="Invoices" description="Proforma and commercial invoices.">
      {() => <InvoiceList />}
    </Page>
  );
}

function InvoiceList() {
  const { data = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (data.length === 0) {
    return (
      <EmptyState
        title="No invoices yet"
        description="A proforma invoice appears once your order is confirmed."
      />
    );
  }

  return (
    <div className="space-y-3">
      {data.map((invoice) => (
        <Card key={invoice.id} className={invoice.state === "superseded" ? "opacity-70" : ""}>
          <CardContent className="flex items-center justify-between gap-3 pt-5">
            <div>
              <p className="font-medium">
                {invoice.invoice_number} · v{invoice.version}
              </p>
              <p className="stat-label">
                {invoice.kind === "proforma" ? "Proforma" : "Commercial"} ·{" "}
                {new Date(invoice.issue_date).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatMoney(invoice.total_value)}</p>
              <Badge variant={invoice.state === "current" ? "default" : "secondary"}>
                {invoice.state}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
