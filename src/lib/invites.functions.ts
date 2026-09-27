import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type InviteCheck = {
  valid: boolean;
  reason?: string;
  email?: string;
  contactName?: string | null;
  companyName?: string | null;
};

export const checkInvite = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ token: z.string().min(4) }).parse(data))
  .handler(async ({ data }): Promise<InviteCheck> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error } = await supabaseAdmin
      .from("customer_invites")
      .select("email, contact_name, company_name, accepted_at, revoked_at, expires_at")
      .eq("token", data.token)
      .maybeSingle();

    if (error || !invite) return { valid: false, reason: "This invitation link is not valid." };
    if (invite.revoked_at) return { valid: false, reason: "This invitation has been cancelled." };
    if (invite.accepted_at) return { valid: false, reason: "This invitation has already been used." };
    if (new Date(invite.expires_at).getTime() < Date.now())
      return { valid: false, reason: "This invitation has expired." };

    return {
      valid: true,
      email: invite.email,
      contactName: invite.contact_name,
      companyName: invite.company_name,
    };
  });
