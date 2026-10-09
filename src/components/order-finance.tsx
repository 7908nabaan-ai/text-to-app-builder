import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { calcBalance, formatMoney } from "@/lib/calc";

type Props = { orderId: string; customerId: string; isStaff: boolean };

export function useOrderFinance(orderId: string) {
  const invoices = useQuery({
    queryKey: ["order-invoices", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const payments = useQuery({
    queryKey: ["order-payments", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("order_id", orderId)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  return { invoices: invoices.data ?? [], payments: payments.data ?? [] };
}

export function OrderFinance({ orderId, customerId, isStaff }: Props) {
  const qc = useQueryClient();
  const { invoices, payments } = useOrderFinance(orderId);
  const [advanceMode, setAdvanceMode] = useState<"percent" | "amount">("percent");
  const [advance, setAdvance] = useState("30");
  const [pay, setPay] = useState({ amount: "", method: "Bank transfer", reference: "", paid_at: "" });
  const [freight, setFreight] = useState("0");
  const [handling, setHandling] = useState("0");
  const { data: previewValue } = useQuery({
    queryKey: ["order-product-value", orderId],
    enabled: isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_lines")
        .select("negotiated_price, current_quantity, final_quantity")
        .eq("order_id", orderId);
      if (error) throw error;
      return (data ?? []).reduce((s, l) => s + Number(l.negotiated_price) * Number(l.final_quantity ?? l.current_quantity), 0);
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["order-invoices", orderId] });
    void qc.invalidateQueries({ queryKey: ["order-payments", orderId] });
    void qc.invalidateQueries({ queryKey: ["invoices"] });
    void qc.invalidateQueries({ queryKey: ["order", orderId] });
  };

  const issue = useMutation({
    mutationFn: async (kind: "proforma" | "commercial") => {
      const value = Number(advance) || 0;
      const { error } = await supabase.rpc("issue_invoice", {
        _order_id: orderId,
        _kind: kind,
        ...(advanceMode === "percent" ? { _advance_percent: value } : { _advance_amount: value }),
        ...(kind === "commercial" ? { _freight: Number(freight) || 0, _handling: Number(handling) || 0 } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice issued");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const record = useMutation({
    mutationFn: async () => {
      const amount = Number(pay.amount);
      if (!(amount > 0)) throw new Error("Enter an amount greater than zero");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("payments").insert({
        order_id: orderId,
        customer_id: customerId,
        amount,
        method: pay.method || null,
        reference: pay.reference || null,
        ...(pay.paid_at ? { paid_at: pay.paid_at } : {}),
        recorded_by: auth.user?.id ?? null,
      });
      if (error) throw error;
      await supabase.from("notifications").insert({
        user_id: customerId,
        order_id: orderId,
        title: `Payment received: ${formatMoney(amount)}`,
        body: "Thank you — your balance has been updated.",
      });
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      setPay({ amount: "", method: "Bank transfer", reference: "", paid_at: "" });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelPayment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payments").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmed = payments.filter((p) => p.status === "confirmed").map((p) => ({ amount: Number(p.amount) }));
  const commercial = invoices.find((i) => i.kind === "commercial" && i.state === "current");
  const proforma = invoices.find((i) => i.kind === "proforma" && i.state === "current");
  const reference = commercial ?? proforma;
  const balance = calcBalance(Number(reference?.total_value ?? 0), confirmed);
  const advanceDue = proforma ? Math.max(Number(proforma.advance_amount) - balance.totalPaid, 0) : 0;
  const freightN = Number(freight) || 0;
  const handlingN = Number(handling) || 0;
  const chargesInvalid = freightN < 0 || handlingN < 0;
  const previewProducts = previewValue ?? 0;

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between">
          <p className="stat-label">Invoices & payments</p>
          {reference && (
            <Badge variant={balance.status === "overpaid" ? "destructive" : "secondary"}>
              {balance.status.replace("_", " ")}
            </Badge>
          )}
        </div>

        {commercial && (
          <div className="space-y-1 rounded-md border p-3 text-sm">
            <Row label="Final product subtotal" value={formatMoney(Number(commercial.product_value ?? commercial.total_value))} />
            <Row label="Freight charges" value={formatMoney(Number(commercial.freight_charges ?? 0))} />
            <Row label="Handling charges" value={formatMoney(Number(commercial.handling_charges ?? 0))} />
            <Row label="Total commercial invoice" value={formatMoney(balance.finalValue)} strong />
            <Row label="Payments received" value={formatMoney(balance.totalPaid)} />
            <Row label="Balance due" value={formatMoney(balance.balanceDue)} strong />
            {balance.overpayment > 0 && <Row label="Overpayment / credit — review" value={formatMoney(balance.overpayment)} strong />}
          </div>
        )}
        {reference && !commercial && (
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat label="Order value" value={formatMoney(balance.finalValue)} />
            <Stat label="Paid" value={formatMoney(balance.totalPaid)} />
            <Stat label="Advance still due" value={formatMoney(advanceDue)} />
            {balance.overpayment > 0 ? (
              <Stat label="Overpaid — review" value={formatMoney(balance.overpayment)} />
            ) : (
              <Stat label="Remaining total" value={formatMoney(balance.balanceDue)} />
            )}
          </div>
        )}

        <div className="space-y-2">
          {invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet.</p>}
          {invoices.map((inv) => (
            <div key={inv.id} className={`flex items-center justify-between rounded-md border p-3 text-sm ${inv.state !== "current" ? "opacity-60" : ""}`}>
              <div>
                <p className="font-medium">{inv.invoice_number} · v{inv.version}</p>
                <p className="stat-label">
                  {inv.kind === "proforma" ? "Proforma" : "Commercial"} · advance {formatMoney(Number(inv.advance_amount))}
                  {inv.kind === "commercial" && ` · freight ${formatMoney(Number(inv.freight_charges ?? 0))} · handling ${formatMoney(Number(inv.handling_charges ?? 0))}`}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatMoney(Number(inv.total_value))}</p>
                <Badge variant={inv.state === "current" ? "default" : "secondary"}>{inv.state}</Badge>
              </div>
            </div>
          ))}
        </div>

        {isStaff && (
          <div className="space-y-3 rounded-md border border-dashed p-3">
            <p className="text-sm font-medium">Issue invoice</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex rounded-md border">
                {(["percent", "amount"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAdvanceMode(m)}
                    className={`px-3 py-2 text-sm ${advanceMode === m ? "bg-primary text-primary-foreground" : ""}`}
                  >
                    {m === "percent" ? "Advance %" : "Fixed advance"}
                  </button>
                ))}
              </div>
              <Input className="h-10 w-28" type="number" min={0} value={advance} onChange={(e) => setAdvance(e.target.value)} />
              <Button size="sm" onClick={() => issue.mutate("proforma")} disabled={issue.isPending}>
                {proforma ? "Re-issue proforma" : "Proforma"}
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs">
                Freight charges
                <Input className="h-10 w-32" type="number" min={0} step="0.01" value={freight} onChange={(e) => setFreight(e.target.value)} />
              </label>
              <label className="text-xs">
                Handling charges
                <Input className="h-10 w-32" type="number" min={0} step="0.01" value={handling} onChange={(e) => setHandling(e.target.value)} />
              </label>
              <Button size="sm" variant="outline" onClick={() => issue.mutate("commercial")} disabled={issue.isPending || chargesInvalid}>
                {commercial ? "Re-issue commercial" : "Commercial"}
              </Button>
            </div>
            {chargesInvalid ? (
              <p className="text-xs text-destructive">Charges must be zero or more.</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Preview: products {formatMoney(previewProducts)} + freight {formatMoney(freightN)} + handling {formatMoney(handlingN)} ={" "}
                <strong>{formatMoney(previewProducts + freightN + handlingN)}</strong>
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Issued invoices are locked. Re-issuing creates a new version and keeps the old one visible. Freight and handling apply to commercial invoices only.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Payments</p>
          {payments.length === 0 && <p className="text-sm text-muted-foreground">No payments recorded.</p>}
          {payments.map((p) => (
            <div key={p.id} className={`flex items-center justify-between text-sm ${p.status !== "confirmed" ? "line-through opacity-60" : ""}`}>
              <span>
                {new Date(p.paid_at).toLocaleDateString()} · {p.method ?? "—"}
                {p.reference ? ` · ${p.reference}` : ""}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold">{formatMoney(Number(p.amount))}</span>
                {isStaff && p.status === "confirmed" && (
                  <Button size="sm" variant="ghost" onClick={() => cancelPayment.mutate(p.id)}>
                    Void
                  </Button>
                )}
              </span>
            </div>
          ))}
        </div>

        {isStaff && (
          <form
            className="grid gap-2 sm:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              record.mutate();
            }}
          >
            <Field label="Amount"><Input type="number" step="0.01" min={0} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
            <Field label="Date"><Input type="date" value={pay.paid_at} onChange={(e) => setPay({ ...pay, paid_at: e.target.value })} /></Field>
            <Field label="Method"><Input value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} /></Field>
            <Field label="Reference"><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={record.isPending}>Record payment</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-2">
      <p className="stat-label">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
