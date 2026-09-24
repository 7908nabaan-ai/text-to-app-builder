import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/staff/settings")({
  head: () => ({
    meta: [
      { title: "Company settings — Sky Plus" },
      { name: "description", content: "Company details, contact numbers and container types." },
      { property: "og:title", content: "Company settings — Sky Plus" },
      { property: "og:description", content: "Company details, contact numbers and containers." },
    ],
  }),
  component: SettingsPage,
});

type SettingsForm = {
  company_name: string;
  whatsapp_number: string;
  viber_number: string;
  contact_email: string;
  address: string;
  currency: string;
  payment_instructions: string;
};

function SettingsPage() {
  return (
    <Page title="Settings" description="Company profile, contact channels and containers.">
      {({ isStaff }) =>
        isStaff ? (
          <SettingsBody />
        ) : (
          <EmptyState title="Staff only" description="This page is for Sky Plus staff." />
        )
      }
    </Page>
  );
}

function SettingsBody() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SettingsForm>({
    company_name: "",
    whatsapp_number: "",
    viber_number: "",
    contact_email: "",
    address: "",
    currency: "USD",
    payment_instructions: "",
  });

  const { data } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: containers = [] } = useQuery({
    queryKey: ["container-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("container_types")
        .select("*")
        .order("capacity_cbm");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      company_name: data.company_name ?? "",
      whatsapp_number: data.whatsapp_number ?? "",
      viber_number: data.viber_number ?? "",
      contact_email: data.contact_email ?? "",
      address: data.address ?? "",
      currency: data.currency ?? "USD",
      payment_instructions: data.payment_instructions ?? "",
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!data?.id) throw new Error("Settings row missing");
      const { error } = await supabase.from("app_settings").update(form).eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      void queryClient.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateContainer = useMutation({
    mutationFn: async ({ id, capacity }: { id: string; capacity: number }) => {
      const { error } = await supabase
        .from("container_types")
        .update({ capacity_cbm: capacity })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Container capacity updated");
      void queryClient.invalidateQueries({ queryKey: ["container-types"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const field = (key: keyof SettingsForm, label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        className="h-11"
        value={form[key]}
        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          {field("company_name", "Company name")}
          {field("whatsapp_number", "WhatsApp number (with country code)")}
          {field("viber_number", "Viber number (with country code)")}
          {field("contact_email", "Contact email")}
          {field("currency", "Currency code")}
          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={form.address}
              onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment_instructions">Payment instructions (shown on invoices)</Label>
            <Textarea
              id="payment_instructions"
              value={form.payment_instructions}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, payment_instructions: e.target.value }))
              }
            />
          </div>
          <Button className="h-11 w-full" onClick={() => save.mutate()} disabled={save.isPending}>
            Save settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="stat-label">Container types</p>
          {containers.map((container) => (
            <div key={container.id} className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor={`c-${container.id}`}>
                  {container.name} ({container.code})
                </Label>
                <Input
                  id={`c-${container.id}`}
                  type="number"
                  step="0.01"
                  className="h-11"
                  defaultValue={container.capacity_cbm}
                  onBlur={(e) => {
                    const capacity = Number(e.target.value);
                    if (capacity > 0 && capacity !== container.capacity_cbm) {
                      updateContainer.mutate({ id: container.id, capacity });
                    }
                  }}
                />
              </div>
              <span className="pb-3 text-sm text-muted-foreground">CBM</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
