import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { checkInvite, type InviteCheck } from "@/lib/invites.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Ship } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { oauthReturnPath } from "@/lib/oauth-return-path";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ invite: z.string().optional(), next: z.string().optional() }),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Sign in — Sky Plus" },
      {
        name: "description",
        content: "Sign in to Sky Plus to place container orders and track shipments.",
      },
      { property: "og:title", content: "Sign in — Sky Plus" },
      {
        property: "og:description",
        content: "Sign in to Sky Plus to place container orders and track shipments.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "reset";

function AuthPage() {
  const navigate = useNavigate();
  const { invite: inviteToken, next: rawNext } = Route.useSearch();
  const nextPath = rawNext ? oauthReturnPath(rawNext) : null;
  const goNext = (replace = false) => (nextPath && nextPath !== "/" ? window.location.assign(nextPath) : navigate({ to: "/dashboard", replace }));
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<InviteCheck | null>(null);
  const [inviteChecking, setInviteChecking] = useState(Boolean(inviteToken));
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void goNext(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void goNext(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search.replace(/^\?/, "") + "&" + window.location.hash.replace(/^#/, ""));
    const desc = params.get("error_description");
    if (desc) {
      setOauthError(
        /invit|database error|42501/i.test(desc)
          ? "This Google account has not been invited to this Sky Plus workspace. Please contact your administrator."
          : desc,
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!inviteToken) {
      setInvite(null);
      setInviteChecking(false);
      return;
    }
    setInviteChecking(true);
    void checkInvite({ data: { token: inviteToken } }).then((result) => {
      if (cancelled) return;
      setInvite(result);
      if (result.valid) {
        setMode("signup");
        setEmail(result.email ?? "");
        setContactName(result.contactName ?? "");
        setCompany(result.companyName ?? "");
      } else {
        setMode("signin");
        toast.error(result.reason ?? "This invitation link is not valid.");
      }
    }).catch(() => {
      if (cancelled) return;
      setInvite(null);
      setOauthError("Could not check your invitation. Please reload this page and try again.");
    }).finally(() => {
      if (!cancelled) setInviteChecking(false);
    });
    return () => { cancelled = true; };
  }, [inviteToken]);


  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (mode === "signup") {
      if (inviteChecking || !invite?.valid) {
        setFormError("Open a valid invitation link from Sky Plus to create your account.");
        return;
      }
      if (username.trim().length < 3) {
        setFormError("Username must contain at least 3 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setFormError("Passwords do not match.");
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        void goNext();
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: invite?.email ?? email,
          password,
          options: {
            emailRedirectTo: nextPath && nextPath !== "/" ? new URL(nextPath, window.location.origin).href : `${window.location.origin}/auth`,
            data: { username: username.trim(), contact_name: contactName.trim() || username.trim(), company_name: company, phone },
          },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to confirm, then sign in.");
        setPassword("");
        setConfirmPassword("");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Password reset link sent to your email.");
        setMode("signin");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    if (inviteChecking) return;
    setBusy(true);
    setOauthError(null);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: nextPath && nextPath !== "/" ? new URL(nextPath, window.location.origin).href : `${window.location.origin}/auth${inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : ""}`,
        extraParams: {
          prompt: "select_account",
          ...(invite?.valid && invite.email ? { login_hint: invite.email } : {}),
        },
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!data.user) throw new Error("Google sign-in did not complete. Please try again.");
      await goNext();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "");
      setOauthError(
        /invit|database error|42501/i.test(msg)
          ? "Choose the Google account with the email address on your invitation. If it is a different email, ask Sky Plus for a new invitation."
          : "Google sign-in failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-primary/5 px-4 py-10">
      <BackButton fallback="/" className="absolute left-2 top-2" />
      <Link to="/" className="mb-6 flex items-center gap-2 text-primary">
        <Ship className="h-7 w-7" />
        <span className="font-display text-2xl font-bold tracking-wide">SKY PLUS</span>
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {mode === "signin" ? "Sign in to Sky Plus" : mode === "signup" ? "Create account" : "Reset password"}
          </CardTitle>
          <CardDescription>
            {mode === "reset"
              ? "We'll email you a link to set a new password."
              : mode === "signup"
                ? `You were invited to Sky Plus${invite?.companyName ? ` as ${invite.companyName}` : ""}.`
                : "Container ordering and shipment management."}
          </CardDescription>

        </CardHeader>
        <CardContent className="space-y-4">
          {oauthError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {oauthError}
            </p>
          )}
          {mode !== "reset" && (
            <>
              <Button type="button" className="h-12 w-full text-base" onClick={handleGoogle} disabled={busy || inviteChecking}>
                {inviteChecking ? "Checking invitation…" : "Continue with Google"}
              </Button>
              {invite?.valid && invite.email && (
                <p className="break-words text-center text-sm text-muted-foreground">Use your Google account for <strong>{invite.email}</strong>. No password is needed.</p>
              )}
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="stat-label">or use email</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            {mode === "signup" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className="h-11" minLength={3} maxLength={50} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact">Contact person</Label>
                  <Input
                    id="contact"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="h-11"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company">Company name</Label>
                  <Input
                    id="company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-11"
                  />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                readOnly={mode === "signup" && Boolean(invite?.valid)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
                required
              />
            </div>
            {mode !== "reset" && (
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11"
                  minLength={6}
                  required
                />
              </div>
            )}
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-11" minLength={6} required />
                <p className="text-xs text-muted-foreground">Use your email and password to sign in after confirming your email.</p>
              </div>
            )}
            <Button type="submit" variant="outline" className="h-11 w-full" disabled={busy || inviteChecking}>
              {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send link"}
            </Button>
          </form>

          <div className="space-y-2 text-center text-sm text-muted-foreground">
            {mode === "signin" && (
              <>
                <Button type="button" variant="link" onClick={() => { setFormError(null); setMode("reset"); }}>
                  Forgot your password?
                </Button>
                <Button type="button" variant="link" className="w-full" disabled={inviteChecking} onClick={() => {
                  if (!invite?.valid) {
                    setFormError("Open your invitation link from Sky Plus to create an account. Contact the administrator if you need one.");
                    return;
                  }
                  setFormError(null);
                  setPassword("");
                  setConfirmPassword("");
                  setMode("signup");
                }}>Create account</Button>
                <p>New customers can only join with an invitation link from Sky Plus.</p>
                <Link to="/contact" className="block underline">Contact administrator</Link>
              </>
            )}

            {mode !== "signin" && (
              <Button
                type="button"
                variant="link"
                onClick={() => { setFormError(null); setPassword(""); setConfirmPassword(""); setMode("signin"); }}
              >
                Back to sign in
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
