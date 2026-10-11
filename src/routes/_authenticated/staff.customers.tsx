import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_LABELS } from "@/lib/orders";
import { whatsappLink, telLink } from "@/lib/contact";

export const Route = createFileRoute("/_authenticated/staff/customers")({
  head: () => ({
    meta: [
      { title: "Customers — Sky Plus" },
      { name: "description", content: "Customer directory with contact details and open orders." },
      { property: "og:title", content: "Customers — Sky Plus" },
      {
        property: "og:description",
        content: "Customer directory with contact details and open orders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomersPage,
});

type CustomerRow = {
  id: string;
  contact_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  shipping_destination: string | null;
  shipping_country: string | null;
};

function CustomersPage() {
  return (
    <Page title="Customers" description="Everyone who can place orders with Sky Plus.">
      {({ isStaff }) =>
        isStaff ? (
          <CustomersBody />
        ) : (
          <EmptyState title="Staff only" description="This page is for Sky Plus staff." />
        )
      }
    </Page>
  );
}

function CustomersBody() {
  const [search, setSearch] = useState("");

  const { data: customers = [] } = useQuery({
    queryKey: ["staff-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, contact_name, company_name, email, phone, shipping_destination, shipping_country",
        )
        .order("company_name", { nullsFirst: false });
      if (error) throw error;
      return data as CustomerRow[];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["staff-customer-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_id, order_number, status, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const term = search.trim().toLowerCase();
  const filtered = customers.filter((customer) => {
    if (!term) return true;
    return [
      customer.company_name,
      customer.contact_name,
      customer.email,
      customer.shipping_destination,
      customer.shipping_country,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  return (
    <div className="space-y-4">
      <Input
        className="h-11"
        placeholder="Search by company, name, email or destination"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No customers found"
          description="Customers appear here once they create an account."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">No.</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Contact & email</th>
                <th className="px-3 py-2">Destination</th>
                <th className="px-3 py-2">Orders</th>
                <th className="px-3 py-2">Latest order</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer, index) => {
                const customerOrders = orders.filter((order) => order.customer_id === customer.id);
                const latest = customerOrders[0];
                return (
                  <tr key={customer.id} className="whitespace-nowrap border-t border-border">
                    <td className="px-3 py-2"><span className="list-number">{index + 1}.</span></td>
                    <td className="px-3 py-2 font-medium">{customer.company_name || customer.contact_name || "Customer"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{customer.contact_name || "—"}{customer.email ? ` · ${customer.email}` : ""}</td>
                    <td className="px-3 py-2 text-muted-foreground">{[customer.shipping_destination, customer.shipping_country].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-3 py-2"><Badge variant="secondary">{customerOrders.length}</Badge></td>
                    <td className="px-3 py-2">
                      {latest ? (
                        <Link to="/staff/orders/$orderId" params={{ orderId: latest.id }} className="hover:underline">
                          <span className="font-medium">{latest.order_number}</span>{" "}
                          <span className="text-muted-foreground">{STATUS_LABELS[latest.status] ?? latest.status}</span>
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button asChild size="sm"><Link to="/staff/customers/$customerId" params={{ customerId: customer.id }}>Workspace</Link></Button>
                        {whatsappLink(customer.phone) && (
                          <Button asChild size="sm" variant="outline"><a href={whatsappLink(customer.phone)!} target="_blank" rel="noopener noreferrer">WhatsApp</a></Button>
                        )}
                        {telLink(customer.phone) && (
                          <Button asChild size="sm" variant="outline"><a href={telLink(customer.phone)!}>Call</a></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
