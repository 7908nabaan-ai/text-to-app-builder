import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Phone, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isValidPhone, telLink, viberLink, whatsappLink } from "@/lib/contact";

export function useAppSettings() {
  return useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function ContactButtons({ message }: { message?: string }) {
  const { data } = useAppSettings();
  const whatsapp = whatsappLink(data?.whatsapp_number, message);
  const viber = viberLink(data?.viber_number);
  const tel = telLink(data?.whatsapp_number ?? data?.viber_number);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success("Copied");
  };

  const anyNumber = isValidPhone(data?.whatsapp_number) || isValidPhone(data?.viber_number);

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <p className="stat-label">Contact Sky Plus</p>
        {!anyNumber && (
          <p className="text-sm text-muted-foreground">
            Contact numbers have not been set yet. Sky Plus staff can add them in Settings.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {whatsapp && (
            <Button asChild variant="secondary" className="h-11">
              <a href={whatsapp} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
              </a>
            </Button>
          )}
          {viber && (
            <Button asChild variant="secondary" className="h-11">
              <a href={viber}>
                <MessageCircle className="mr-2 h-4 w-4" /> Viber
              </a>
            </Button>
          )}
          {tel && (
            <Button asChild variant="outline" className="h-11">
              <a href={tel}>
                <Phone className="mr-2 h-4 w-4" /> Call
              </a>
            </Button>
          )}
        </div>
        {anyNumber && (
          <div className="space-y-1 text-sm text-muted-foreground">
            {data?.whatsapp_number && (
              <button
                type="button"
                className="flex items-center gap-2"
                onClick={() => copy(data.whatsapp_number!)}
              >
                <Copy className="h-3.5 w-3.5" /> WhatsApp: {data.whatsapp_number}
              </button>
            )}
            {data?.viber_number && (
              <button
                type="button"
                className="flex items-center gap-2"
                onClick={() => copy(data.viber_number!)}
              >
                <Copy className="h-3.5 w-3.5" /> Viber: {data.viber_number}
              </button>
            )}
            {data?.contact_email && <p>Email: {data.contact_email}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
