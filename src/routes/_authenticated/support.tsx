import { createFileRoute, Link } from "@tanstack/react-router";
import { Page } from "@/components/page";
import { ContactButtons } from "@/components/contact-buttons";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({
    meta: [
      { title: "Help & support — Sky Plus" },
      { name: "description", content: "Reach the Sky Plus team by WhatsApp, Viber or order chat." },
      { property: "og:title", content: "Help & support — Sky Plus" },
      { property: "og:description", content: "Reach the Sky Plus team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

const FAQ = [
  ["How do I start an order?", "Open Order & catalogue, press New order and choose 20 FT, 40 FT or 40 FT High Cube. Then add products."],
  ["Can I go over the container limit?", "Yes. You will see a warning, but you can still submit — Sky Plus will review the load with you."],
  ["Can I change prices?", "No. Prices are set by Sky Plus. Ask in the order chat if you would like to negotiate."],
  ["Where do I see what I owe?", "Payments & balance shows your outstanding balance and every payment recorded."],
];

function SupportPage() {
  return (
    <Page title="Help & support">
      {() => (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="space-y-3 rounded-md border border-border bg-card p-4">
            <h2 className="font-bold">Contact Sky Plus</h2>
            <ContactButtons message="Hello Sky Plus, I need help" />
            <p className="text-sm text-muted-foreground">For a specific order, use its chat in <Link to="/messages" className="text-primary underline">Messages</Link>.</p>
          </section>
          <section className="space-y-3 rounded-md border border-border bg-card p-4">
            <h2 className="font-bold">Common questions</h2>
            {FAQ.map(([q, a]) => <details key={q} className="border-b border-border pb-2"><summary className="cursor-pointer text-sm font-medium">{q}</summary><p className="mt-1 text-sm text-muted-foreground">{a}</p></details>)}
          </section>
        </div>
      )}
    </Page>
  );
}
