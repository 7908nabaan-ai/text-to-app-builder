import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ContactButtons } from "@/components/contact-buttons";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile — Sky Plus" },
      { name: "description", content: "Your contact, company and shipping details on Sky Plus." },
      { property: "og:title", content: "My profile — Sky Plus" },
      { property: "og:description", content: "Your contact, company and shipping details." },
    ],
  }),
  component: ProfilePage,
});

type ProfileForm = {
  contact_name: string;
  phone: string;
  company_name: string;
  company_details: string;
  shipping_country: string;
  shipping_destination: string;
  shipping_address: string;
};

const empty: ProfileForm = {
  contact_name: "",
  phone: "",
  company_name: "",
  company_details: "",
  shipping_country: "",
  shipping_destination: "",
  shipping_address: "",
};

function ProfilePage() {
  return (
    <Page title="My profile" description="Used on your invoices and for shipping.">
      {({ userId }) => <ProfileForm userId={userId} />}
    </Page>
  );
}

function ProfileForm({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProfileForm>(empty);

  const { data } = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      contact_name: data.contact_name ?? "",
      phone: data.phone ?? "",
      company_name: data.company_name ?? "",
      company_details: data.company_details ?? "",
      shipping_country: data.shipping_country ?? "",
      shipping_destination: data.shipping_destination ?? "",
      shipping_address: data.shipping_address ?? "",
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: userId, ...form }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile saved");
      void queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const field = (key: keyof ProfileForm, label: string, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type={type}
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
          {field("contact_name", "Contact person")}
          {field("phone", "Phone number", "tel")}
          {field("company_name", "Company / business name")}
          <div className="space-y-1.5">
            <Label htmlFor="company_details">Company details</Label>
            <Textarea
              id="company_details"
              value={form.company_details}
              onChange={(e) => setForm((prev) => ({ ...prev, company_details: e.target.value }))}
            />
          </div>
          {field("shipping_country", "Shipping country")}
          {field("shipping_destination", "Shipping destination (port / city)")}
          <div className="space-y-1.5">
            <Label htmlFor="shipping_address">Shipping address</Label>
            <Textarea
              id="shipping_address"
              value={form.shipping_address}
              onChange={(e) => setForm((prev) => ({ ...prev, shipping_address: e.target.value }))}
            />
          </div>
          <Button className="h-11 w-full" onClick={() => save.mutate()} disabled={save.isPending}>
            Save profile
          </Button>
        </CardContent>
      </Card>

      <ContactButtons />
    </div>
  );
}
