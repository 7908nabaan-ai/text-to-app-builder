import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin } from "lucide-react";
import { PublicLayout } from "@/components/public-layout";
import { ContactButtons, useAppSettings } from "@/components/contact-buttons";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us — Sky Plus" },
      { name: "description", content: "Reach Sky Plus by WhatsApp, Viber, phone or email about wholesale container orders." },
      { property: "og:title", content: "Contact Us — Sky Plus" },
      { property: "og:description", content: "Reach Sky Plus by WhatsApp, Viber, phone or email." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Contact,
});

function Contact() {
  const { data } = useAppSettings();
  return (
    <PublicLayout>
      <section className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="font-display text-4xl font-bold">Contact us</h1>
        <p className="mt-2 text-muted-foreground">
          Questions about products, container sizes or an account? Message us directly.
        </p>
        <div className="mt-6">
          <ContactButtons message="Hello Sky Plus, I'd like to ask about an order." />
        </div>
        <div className="mt-6 space-y-3 text-sm">
          {data?.contact_email && (
            <a href={`mailto:${data.contact_email}`} className="flex items-center gap-2 hover:underline">
              <Mail className="h-4 w-4 text-gold" /> {data.contact_email}
            </a>
          )}
          {data?.address && (
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gold" /> {data.address}
            </p>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
