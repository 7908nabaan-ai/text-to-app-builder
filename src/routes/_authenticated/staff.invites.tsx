import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Page, EmptyState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff/invites")({
  head: () => ({
    meta: [
      { title: "Customer invitations — Sky Plus" },
      {
        name: "description",
        content: "Invite wholesale customers to Sky Plus with a private sign-up link.",
      },
      { property: "og:title", content: "Customer invitations — Sky Plus" },
      {
        property: "og:description",
        content: "Invite wholesale customers to Sky Plus with a private sign-up link.",
      },
    ],
  }),
  component: InvitesPage,
});

type Invite = {
  id: string;
  token: string;
  email: string;
  contact_name: string | null;
  company_name: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  role: string;
  created_at: string;
};

function inviteUrl(token: string) {
  return `${window.location.origin}/auth?invite=${token}`;
}

function InvitesPage() {
  const { isStaff } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState<"customer" | "admin" | "owner">("customer");

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ["invites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_invites")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Invite[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("customer_invites")
        .insert({
          email: email.trim().toLowerCase(),
          contact_name: contactName.trim() || null,
          company_name: company.trim() || null,
          created_by: userData.user?.id ?? null,
          role,
        })
        .select("token")
        .single();
      if (error) throw error;
      return data.token as string;
    },
    onSuccess: async (token) => {
      setEmail("");
      setContactName("");
      setCompany("");
      await queryClient.invalidateQueries({ queryKey: ["invites"] });
      await navigator.clipboard.writeText(inviteUrl(token)).catch(() => undefined);
      toast.success("Invitation created — link copied. Send it to your customer.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create"),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("customer_invites")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invites"] });
      toast.success("Invitation cancelled");
    },
  });

  if (!isStaff) {
    return (
      <Page title="Invitations">
        {() => (
          <EmptyState title="Staff only" description="Only Sky Plus staff can invite customers." />
        )}
      </Page>
    );
  }

  const statusOf = (invite: Invite) => {
    if (invite.revoked_at) return { label: "Cancelled", variant: "outline" as const };
    if (invite.accepted_at) return { label: "Joined", variant: "secondary" as const };
    if (new Date(invite.expires_at).getTime() < Date.now())
      return { label: "Expired", variant: "outline" as const };
    return { label: "Waiting", variant: "default" as const };
  };

  return (
    <Page
      title="Invitations"
      description="People can only join with a link you send them. Choose their role when inviting."
    >
      {() => (
        <>
          <Card className="mb-5">
            <CardContent className="space-y-3 pt-5">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Customer email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  inputMode="email"
                  className="h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-contact">Contact person</Label>
                  <Input
                    id="invite-contact"
                    className="h-11"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-company">Company</Label>
                  <Input
                    id="invite-company"
                    className="h-11"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                >
                  <option value="customer">Customer</option>
                  <option value="admin">Admin (staff tools)</option>
                  <option value="owner">Owner (max 2)</option>
                </select>
                <p className="text-xs text-muted-foreground">Only Owners can invite Admins or Owners.</p>
              </div>
              <Button
                className="h-11 w-full sm:w-auto"
                disabled={!email.trim() || create.isPending}
                onClick={() => create.mutate()}
              >
                <Send className="mr-2 h-4 w-4" /> Create invitation link
              </Button>
            </CardContent>
          </Card>

          {isLoading ? null : invites.length === 0 ? (
            <EmptyState
              title="No invitations yet"
              description="Create a link above and send it by WhatsApp or email."
            />
          ) : (
            <div className="space-y-3">
              {invites.map((invite) => {
                const status = statusOf(invite);
                const open = !invite.accepted_at && !invite.revoked_at;
                return (
                  <Card key={invite.id}>
                    <CardContent className="flex flex-wrap items-center gap-3 pt-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{invite.email}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {invite.company_name ?? invite.contact_name ?? "—"}
                        </p>
                      </div>
                      <Badge variant="outline" className="capitalize">{invite.role}</Badge>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {open && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void navigator.clipboard.writeText(inviteUrl(invite.token));
                              toast.success("Link copied");
                            }}
                          >
                            <Copy className="mr-2 h-4 w-4" /> Copy link
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revoke.mutate(invite.id)}
                            disabled={revoke.isPending}
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </Page>
  );
}
