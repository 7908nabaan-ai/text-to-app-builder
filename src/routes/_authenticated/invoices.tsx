import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCbm, formatMoney } from "@/lib/calc";
import { OrderFinance } from "@/components/order-finance";
import { Button } from "@/components/ui/button";
import { downloadExcel, downloadPdf, printPdf, type PdfOptions } from "@/lib/exports";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

  const { data: paidByOrder = {} } = useQuery({
    queryKey: ["invoice-paid-totals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("order_id, amount, status");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const p of data ?? []) if (p.status === "confirmed") map[p.order_id] = (map[p.order_id] ?? 0) + Number(p.amount);
      return map;
    },
  });
  const { data: awaiting = [] } = useQuery({
    queryKey: ["orders-awaiting-invoice"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status")
        .in("status", ["confirmed", "loading", "shipped", "completed"])
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const statusOf = (inv: (typeof data)[number]) => {
    if (inv.state !== "current") return inv.state === "superseded" ? "Superseded" : "Cancelled";
    if ((paidByOrder[inv.order_id] ?? 0) >= Number(inv.total_value) && Number(inv.total_value) > 0) return "Paid";
    return inv.sent_at ? "Sent" : "Generated";
  };

  const renderKind = (kind: "proforma" | "commercial") => {
    const list = data.filter((i) => i.kind === kind);
    const notGenerated = awaiting.filter(
      (o) => (kind === "proforma" || o.status === "shipped" || o.status === "completed" || o.status === "loading") &&
        !data.some((i) => i.order_id === o.id && i.kind === kind && i.state === "current"),
    );
    return (
      <div className="space-y-3">
        {notGenerated.map((o) => (
          <Card key={`ng-${o.id}`} className="border-dashed">
            <CardContent className="flex items-center justify-between gap-3 pt-5 text-sm">
              <span><span className="font-medium">{o.order_number}</span> · {kind === "proforma" ? "Proforma" : "Commercial"} invoice</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Not generated</Badge>
                <Button size="sm" variant="outline" asChild>
                  <Link to={isStaff ? "/staff/orders/$orderId" : "/orders/$orderId"} params={{ orderId: o.id }}>
                    {isStaff ? "Generate" : "View order"}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {list.length === 0 && notGenerated.length === 0 && (
          <EmptyState
            title={kind === "proforma" ? "No proforma invoices yet" : "No commercial invoices yet"}
            description={kind === "proforma" ? "A proforma invoice appears once your order is confirmed." : "A commercial invoice appears once goods are loaded."}
          />
        )}
        {list.map((invoice, index) => {
          const status = statusOf(invoice);
          return (
            <Card key={invoice.id} className={invoice.state === "superseded" ? "opacity-70" : ""}>
              <CardContent className="space-y-3 pt-5">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() => setOpen(open === invoice.id ? null : invoice.id)}
                >
                  <div>
                    <p className="font-medium">
                      <span className="list-number">{index + 1}.</span> {invoice.invoice_number} · v{invoice.version}
                    </p>
                    <p className="stat-label">
                      {invoice.kind === "proforma" ? "Proforma" : "Commercial"} · {new Date(invoice.issue_date).toLocaleDateString()}
                      {invoice.sent_at ? ` · sent ${new Date(invoice.sent_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatMoney(Number(invoice.total_value), invoice.currency)}</p>
                    <Badge variant={status === "Paid" ? "default" : status === "Sent" || status === "Generated" ? "secondary" : "outline"}>
                      {status}
                    </Badge>
                  </div>
                </button>
                {open === invoice.id && <InvoiceDetail invoice={invoice} isStaff={isStaff} />}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <Tabs defaultValue="proforma">
      <TabsList>
        <TabsTrigger value="proforma">Proforma invoices</TabsTrigger>
        <TabsTrigger value="commercial">Commercial invoices</TabsTrigger>
      </TabsList>
      <TabsContent value="proforma">{renderKind("proforma")}</TabsContent>
      <TabsContent value="commercial">{renderKind("commercial")}</TabsContent>
    </Tabs>
  );
}

function InvoiceDetail({
  invoice,
  isStaff,
}: {
  invoice: { id: string; order_id: string; customer_id: string; currency: string; total_cbm: number; container_code: string | null; advance_amount: number; payment_instructions: string | null; invoice_number: string; version: number; kind: string; issue_date: string; total_value: number; state: string; sent_at?: string | null; product_value?: number | null; freight_charges?: number; handling_charges?: number };
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
  const isCI = invoice.kind === "commercial";
  const summary = (paid: number): [string, number][] => {
    const total = Number(invoice.total_value);
    const rows: [string, number][] = [["Final product subtotal", Number(invoice.product_value ?? total)]];
    if (isCI) rows.push(["Freight charges", Number(invoice.freight_charges ?? 0)], ["Handling charges", Number(invoice.handling_charges ?? 0)]);
    rows.push([isCI ? "Total commercial invoice value" : "Total value", total], ["Advance", Number(invoice.advance_amount)], ["Payments received", paid], ["Balance due", Math.max(0, total - paid)]);
    if (paid > total) rows.push(["Overpayment / credit", paid - total]);
    return rows;
  };
  const getPaid = async () => {
    const { data: pays } = await supabase.from("payments").select("amount, status").eq("order_id", invoice.order_id);
    return (pays ?? []).filter((p) => p.status === "confirmed").reduce((s, p) => s + Number(p.amount), 0);
  };
  const exportExcel = async () => {
    const paid = await getPaid();
    downloadExcel(`${invoice.invoice_number}-v${invoice.version}.xlsx`, [{
      title: "Invoice",
      head: ["Code", "Product", "Unit", "Qty", "Price", "CBM", "Subtotal"],
      rows: lines.map((l) => [l.sku, l.product_name, l.unit, l.quantity, Number(l.price), Number(l.total_cbm), Number(l.subtotal)]),
    }, { title: "Summary", head: ["Item", "Amount"], rows: summary(paid) }]);
  };
  const qc = useQueryClient();
  const markSent = async () => {
    const { error } = await supabase.from("invoices").update({ sent_at: new Date().toISOString() }).eq("id", invoice.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Invoice marked as sent");
    void qc.invalidateQueries({ queryKey: ["invoices"] });
  };
  const exportPdf = async () => downloadPdf(`${invoice.invoice_number}-v${invoice.version}.pdf`, await pdfOptions());
  const printInvoice = async () => printPdf(await pdfOptions());
  const pdfOptions = async (): Promise<PdfOptions> => {
    const paid = await getPaid();
    const m = (n: number) => formatMoney(n, invoice.currency);
    return {
      title: `${invoice.kind === "proforma" ? "Proforma" : "Commercial"} invoice ${invoice.invoice_number} v${invoice.version}`,
      subtitle: [
        `Date: ${new Date(invoice.issue_date).toLocaleDateString()}   Status: ${invoice.state}`,
        `Container: ${invoice.container_code ?? "-"}   Volume: ${formatCbm(Number(invoice.total_cbm))}`,
      ],
      tables: [{
        title: "",
        head: ["Code", "Product", "Qty", "Price", "CBM", "Subtotal"],
        rows: lines.map((l) => [l.sku, l.product_name, l.quantity, m(Number(l.price)), Number(l.total_cbm).toFixed(3), m(Number(l.subtotal))]),
      }, {
        title: "Summary",
        head: ["Item", "Amount"],
        rows: summary(paid).map(([k, v]) => [k, m(v)]),
      }],
      footer: invoice.payment_instructions ? ["Payment instructions:", invoice.payment_instructions] : [],
    };
  };
  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void exportPdf()}>Download PDF</Button>
        <Button size="sm" variant="outline" onClick={() => void exportExcel()}>Download Excel</Button>
        <Button size="sm" variant="outline" onClick={() => void printInvoice()}>Print</Button>
        {isStaff && invoice.state === "current" && !invoice.sent_at && (
          <Button size="sm" onClick={() => void markSent()}>Mark as sent</Button>
        )}
        <Button size="sm" variant="outline" asChild>
          <Link to="/orders/$orderId" params={{ orderId: invoice.order_id }}>View order</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {invoice.container_code ?? "Container"} · {formatCbm(Number(invoice.total_cbm))} · advance{" "}
        {formatMoney(Number(invoice.advance_amount), invoice.currency)}
      </p>
      <div className="space-y-1">
        {lines.map((l, index) => (
          <div key={l.id} className="flex justify-between gap-2 text-sm">
            <span>
              <span className="list-number">{index + 1}.</span> {l.product_name} <span className="text-muted-foreground">· {l.quantity} × {formatMoney(Number(l.price), invoice.currency)}</span>
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
