import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCbm, formatMoney } from "@/lib/calc";
import { OrderFinance } from "@/components/order-finance";

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
    <Page title="Invoices" description="Proforma and commercial invoices, payments and balances.">
      {({ isStaff }) => <InvoiceList isStaff={isStaff} />}
    </Page>
  );
}

function InvoiceList({ isStaff }: { isStaff: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
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
          <CardContent className="space-y-3 pt-5">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 text-left"
              onClick={() => setOpen(open === invoice.id ? null : invoice.id)}
            >
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
                <p className="font-semibold">{formatMoney(Number(invoice.total_value), invoice.currency)}</p>
                <Badge variant={invoice.state === "current" ? "default" : "secondary"}>
                  {invoice.state}
                </Badge>
              </div>
            </button>
            {open === invoice.id && <InvoiceDetail invoice={invoice} isStaff={isStaff} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function InvoiceDetail({
  invoice,
  isStaff,
}: {
  invoice: { id: string; order_id: string; customer_id: string; currency: string; total_cbm: number; container_code: string | null; advance_amount: number; payment_instructions: string | null };
  isStaff: boolean;
}) {
  const { data: lines = [] } = useQuery({
    queryKey: ["invoice-lines", invoice.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoice_lines").select("*").eq("invoice_id", invoice.id).order("product_name");
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-sm text-muted-foreground">
        {invoice.container_code ?? "Container"} · {formatCbm(Number(invoice.total_cbm))} · advance{" "}
        {formatMoney(Number(invoice.advance_amount), invoice.currency)}
      </p>
      <div className="space-y-1">
        {lines.map((l) => (
          <div key={l.id} className="flex justify-between gap-2 text-sm">
            <span>
              {l.product_name} <span className="text-muted-foreground">· {l.quantity} × {formatMoney(Number(l.price), invoice.currency)}</span>
            </span>
            <span className="font-medium">{formatMoney(Number(l.subtotal), invoice.currency)}</span>
          </div>
        ))}
      </div>
      {invoice.payment_instructions && (
        <p className="whitespace-pre-line rounded-md bg-muted p-3 text-sm">{invoice.payment_instructions}</p>
      )}
      <OrderFinance orderId={invoice.order_id} customerId={invoice.customer_id} isStaff={isStaff} />
    </div>
  );
}
