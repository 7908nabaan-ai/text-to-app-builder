import { createFileRoute, Link } from "@tanstack/react-router";
import { Ship, Container, FileText, MessageCircle } from "lucide-react";
import heroImage from "@/assets/hero-containers.jpg";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sky Plus — Container ordering & shipment management" },
      {
        name: "description",
        content:
          "Build container orders by CBM, negotiate quantities and prices, track invoices, payments and shipment history with Sky Plus.",
      },
      { property: "og:title", content: "Sky Plus — Container ordering & shipment management" },
      {
        property: "og:description",
        content:
          "Build container orders by CBM, negotiate quantities and prices, track invoices, payments and shipment history.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Container,
    title: "Build by container",
    text: "Pick products, watch CBM, remaining capacity and utilisation update live.",
  },
  {
    icon: FileText,
    title: "Invoices & payments",
    text: "Proforma and commercial invoices with versions, advances and real balances.",
  },
  {
    icon: MessageCircle,
    title: "Stay in touch",
    text: "Structured negotiation, plus WhatsApp and Viber when you need a person.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
          <div className="flex items-center gap-2 text-primary">
            <Ship className="h-5 w-5" />
            <span className="font-display text-lg font-bold tracking-wide">SKY PLUS</span>
          </div>
          <Button asChild size="sm" className="ml-auto">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="max-w-xl font-display text-4xl leading-tight font-bold tracking-wide sm:text-5xl">
          Container orders, from first carton to final invoice.
        </h1>
        <p className="mt-4 max-w-lg text-muted-foreground">
          Sky Plus keeps every order, negotiation, payment and shipment in one place — on your
          phone, wherever your container is.
        </p>
        <div className="mt-6">
          <Button asChild size="lg" className="h-12">
            <Link to="/auth">Open your account</Link>
          </Button>
        </div>
        <img
          src={heroImage}
          alt="Cartons being loaded into a shipping container at dawn"
          width={1600}
          height={912}
          className="mt-8 w-full rounded-lg object-cover"
        />
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="rounded-lg border border-border bg-card p-5">
                <Icon className="h-6 w-6 text-accent" />
                <h2 className="mt-3 font-display text-lg font-semibold">{feature.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{feature.text}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
