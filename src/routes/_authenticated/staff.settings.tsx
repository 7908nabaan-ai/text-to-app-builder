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
        .order("sort_order").order("capacity_cbm");
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

  const [rate, setRate] = useState("");
  useEffect(() => { if (data) setRate(String(data.myr_rate ?? 3.95)); }, [data]);
  const saveRate = useMutation({
    mutationFn: async () => {
      const value = Number(rate);
      if (!(value > 0)) throw new Error("Enter a rate above zero");
      const { error } = await supabase.from("app_settings").update({ myr_rate: value }).eq("id", data!.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Exchange rate saved"); void queryClient.invalidateQueries({ queryKey: ["myr-rate"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateContainer = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; capacity_cbm?: number; max_weight_kg?: number; warning_percent?: number; is_active?: boolean }) => {
      const { error } = await supabase.from("container_types").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Container updated — existing orders keep their original limits");
      void queryClient.invalidateQueries({ queryKey: ["container-types"] });
      void queryClient.invalidateQueries({ queryKey: ["container-types-active"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const addContainer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("container_types").insert({ code: `NEW-${Date.now().toString().slice(-5)}`, name: "New container", capacity_cbm: 1, max_weight_kg: 0, is_active: false, sort_order: containers.length + 1 });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["container-types"] }),
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
        <CardContent className="space-y-3 pt-6">
          <p className="stat-label">Currency display</p>
          <p className="text-sm text-muted-foreground">Prices are stored in USD. MYR amounts are shown at this rate and never change saved or negotiated prices.</p>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5"><Label htmlFor="myr_rate">MYR per 1 USD</Label><Input id="myr_rate" type="number" step="0.0001" className="h-11 w-40" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
            <Button className="h-11" onClick={() => saveRate.mutate()} disabled={saveRate.isPending}>Save rate</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between"><p className="stat-label">Container settings</p><Button size="sm" variant="outline" onClick={() => addContainer.mutate()}>Add container</Button></div>
          <p className="text-sm text-muted-foreground">Changes apply to new orders only. Existing orders keep the limits they were created with.</p>
          {containers.map((c, index) => (
            <div key={c.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
              <div className="space-y-1"><Label htmlFor={`n-${c.id}`}>{index + 1}. Container name</Label><Input id={`n-${c.id}`} defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && updateContainer.mutate({ id: c.id, name: e.target.value.trim() })} /></div>
              <div className="space-y-1"><Label htmlFor={`c-${c.id}`}>Max CBM</Label><Input id={`c-${c.id}`} type="number" step="0.01" defaultValue={c.capacity_cbm} onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== Number(c.capacity_cbm)) updateContainer.mutate({ id: c.id, capacity_cbm: v }); }} /></div>
              <div className="space-y-1"><Label htmlFor={`w-${c.id}`}>Max gross weight (kg)</Label><Input id={`w-${c.id}`} type="number" step="1" defaultValue={c.max_weight_kg} onBlur={(e) => { const v = Number(e.target.value); if (v >= 0 && v !== Number(c.max_weight_kg)) updateContainer.mutate({ id: c.id, max_weight_kg: v }); }} /></div>
              <div className="space-y-1"><Label htmlFor={`t-${c.id}`}>Warning at (%)</Label><Input id={`t-${c.id}`} type="number" step="1" defaultValue={c.warning_percent} onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v <= 100 && v !== Number(c.warning_percent)) updateContainer.mutate({ id: c.id, warning_percent: v }); }} /></div>
              <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={c.is_active} onChange={(e) => updateContainer.mutate({ id: c.id, is_active: e.target.checked })} />Active</label>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
