import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, Page } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { fetchOrderBalances } from "@/lib/balances";
import { useCurrency } from "@/lib/currency";
import { CurrencySwitch } from "@/components/ordering";
import { STATUS_LABELS } from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Payments & balance — Sky Plus" },
      { name: "description", content: "Your outstanding balance and every payment recorded by Sky Plus." },
      { property: "og:title", content: "Payments & balance — Sky Plus" },
      { property: "og:description", content: "Outstanding balance and recorded payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});

const PAY_LABEL = { unpaid: "Unpaid", partially_paid: "Partly paid", paid: "Paid", overpaid: "Overpaid — review" } as const;

function PaymentsPage() {
  return (
    <Page title="Payments & balance" actions={<CurrencySwitch />}>
      {({ userId }) => <PaymentsBody userId={userId} />}
    </Page>
  );
}

function PaymentsBody({ userId }: { userId: string }) {
  const { money } = useCurrency();
  const { data } = useQuery({ queryKey: ["balances", userId], queryFn: () => fetchOrderBalances(userId) });
  if (!data) return null;
  const outstanding = data.rows.reduce((s, r) => s + r.balanceDue, 0);
  const paid = data.rows.reduce((s, r) => s + r.totalPaid, 0);
  const credit = data.rows.reduce((s, r) => s + r.overpayment, 0);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-gold bg-card p-4"><p className="stat-label">Outstanding balance</p><p className="font-display text-2xl font-bold">{money(outstanding)}</p></div>
        <div className="rounded-md border border-border bg-card p-4"><p className="stat-label">Total paid</p><p className="font-display text-2xl font-bold">{money(paid)}</p></div>
        <div className="rounded-md border border-border bg-card p-4"><p className="stat-label">Credit / overpayment</p><p className="font-display text-2xl font-bold">{money(credit)}</p></div>
      </div>
      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold">By order</h2>
        {data.rows.length === 0 ? <EmptyState title="No submitted orders yet" /> : (
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-160 text-left text-xs">
              <thead><tr><th scope="col">No.</th><th>Order</th><th>Status</th><th>Value</th><th>Paid</th><th>Balance</th><th>Payment</th></tr></thead>
              <tbody>{data.rows.map((r, index) => (
                <tr key={r.id}><td className="tabular-nums">{index + 1}</td>
                  <td><Link to="/orders/$orderId" params={{ orderId: r.id }} className="font-semibold text-primary">{r.order_number}</Link></td>
                  <td>{STATUS_LABELS[r.status]}</td>
                  <td>{money(r.finalValue)}{!r.invoiced && <span className="block text-muted-foreground">estimate</span>}</td>
                  <td>{money(r.totalPaid)}</td>
                  <td className="font-semibold">{money(r.balanceDue)}</td>
                  <td><Badge variant={r.status === "paid" ? "default" : "secondary"}>{PAY_LABEL[r.status as keyof typeof PAY_LABEL] ?? r.status}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold">Payments received</h2>
        {data.payments.length === 0 ? <EmptyState title="No payments recorded yet" /> : (
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-140 text-left text-xs">
              <thead><tr><th scope="col">No.</th><th>Date</th><th>Order</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th></tr></thead>
              <tbody>{data.payments.map((p, index) => (
                <tr key={p.id}><td className="tabular-nums">{index + 1}</td><td>{new Date(p.paid_at).toLocaleDateString()}</td><td>{data.orderNumber.get(p.order_id)}</td><td className="font-semibold">{money(Number(p.amount))}</td><td>{p.method ?? "—"}</td><td>{p.reference ?? "—"}</td><td>{p.status}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
