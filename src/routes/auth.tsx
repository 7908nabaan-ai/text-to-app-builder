import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Ship } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
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
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [contactName, setContactName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { contact_name: contactName, company_name: company, phone },
          },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to confirm, then sign in.");
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
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Please try again.");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-primary/5 px-4 py-10">
      <Link to="/" className="mb-6 flex items-center gap-2 text-primary">
        <Ship className="h-7 w-7" />
        <span className="font-display text-2xl font-bold tracking-wide">SKY PLUS</span>
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password"}
          </CardTitle>
          <CardDescription>
            {mode === "reset"
              ? "We'll email you a link to set a new password."
              : "Container ordering and shipment management."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
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
            <Button type="submit" className="h-11 w-full" disabled={busy}>
              {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send link"}
            </Button>
          </form>

          {mode !== "reset" && (
            <>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="stat-label">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                onClick={handleGoogle}
                disabled={busy}
              >
                Continue with Google
              </Button>
            </>
          )}

          <div className="space-y-2 text-center text-sm text-muted-foreground">
            {mode === "signin" && (
              <>
                <button type="button" className="underline" onClick={() => setMode("reset")}>
                  Forgot your password?
                </button>
                <p>
                  New customer?{" "}
                  <button
                    type="button"
                    className="font-medium text-primary underline"
                    onClick={() => setMode("signup")}
                  >
                    Create an account
                  </button>
                </p>
              </>
            )}
            {mode !== "signin" && (
              <button
                type="button"
                className="font-medium text-primary underline"
                onClick={() => setMode("signin")}
              >
                Back to sign in
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
