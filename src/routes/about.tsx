import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Container, Handshake } from "lucide-react";
import { PublicLayout } from "@/components/public-layout";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us — Sky Plus" },
      { name: "description", content: "Sky Plus supplies wholesale goods by the container, with clear pricing and full shipment tracking." },
      { property: "og:title", content: "About Us — Sky Plus" },
      { property: "og:description", content: "Wholesale goods by the container, with clear pricing and full shipment tracking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: About,
});

const values = [
  { icon: Container, title: "Container-first", text: "Every order is planned by volume so your 20FT or 40FT container ships full." },
  { icon: Handshake, title: "Fair negotiation", text: "Quantities and prices are agreed openly before anything is invoiced." },
  { icon: ShieldCheck, title: "Clear records", text: "Invoices, payments and balances stay on file — nothing is rewritten later." },
];

function About() {
  return (
    <PublicLayout>
      <section className="mx-auto max-w-4xl px-4 py-12">
        <p className="stat-label text-gold">About Sky Plus</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Wholesale supply, shipped by the container.</h1>
        <p className="mt-4 text-muted-foreground">
          Sky Plus works with wholesale buyers who order full containers of goods. We help you choose
          products, fill your container efficiently, agree final quantities and prices, and track every
          invoice and payment until the shipment arrives.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {values.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-lg border border-border bg-card p-5">
              <Icon className="h-6 w-6 text-gold" />
              <h2 className="mt-3 font-display text-lg font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex gap-3">
          <Button asChild><Link to="/products">Browse products</Link></Button>
          <Button asChild variant="outline"><Link to="/contact">Contact us</Link></Button>
        </div>
      </section>
    </PublicLayout>
  );
}
