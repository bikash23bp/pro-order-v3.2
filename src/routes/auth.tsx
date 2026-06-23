import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { signInWithPasswordOnServer } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { toast } from "sonner";
import { Package } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — OMS" }] }),
  validateSearch: (search) => {
    const redirect = typeof search.redirect === "string" && search.redirect.startsWith("/") && !search.redirect.startsWith("//")
      ? search.redirect
      : "/dashboard";
    return { redirect: redirect === "/auth" ? "/dashboard" : redirect };
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const signInOnServer = useServerFn(signInWithPasswordOnServer);
  const { redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate({ to: redirect });
    });
  }, [navigate, redirect]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    
    try {
      const session = await signInOnServer({ data: { email: normalizedEmail, password } });
      const { error } = await supabase.auth.setSession(session);
      if (error) throw error;
    } catch (error) {
      setLoading(false);
      return toast.error(error instanceof Error ? error.message : "Sign-in failed");
    }

    setLoading(false);
    
    toast.success("Signed in");
    navigate({ to: redirect });
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim()) return toast.error("Enter your email");
    setForgotSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotSending(false);
    if (error) return toast.error(error.message);
    toast.success("Password reset email sent. Check your inbox.");
    setForgotOpen(false);
    setForgotEmail("");
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}${redirect}`,
    });
    if (result.error) return toast.error(result.error.message ?? "Sign-in failed");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-accent/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 grid place-items-center h-12 w-12 rounded-xl bg-primary text-primary-foreground">
            <Package className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">OMS Dashboard</CardTitle>
          <CardDescription>Sign in to manage your orders</CardDescription>
        </CardHeader>
        <CardContent>
          {!forgotOpen ? (
            <>
              <form onSubmit={handleSignIn} className="space-y-3" method="post" action="#">
                <div>
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">Password</Label>
                    <button type="button" onClick={() => { setForgotEmail(email); setForgotOpen(true); }} className="text-xs text-primary hover:underline">
                      Forgot password?
                    </button>
                  </div>
                  <Input id="login-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Please wait..." : "Sign In"}
                </Button>
              </form>
              
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
              </div>
              <Button variant="outline" className="w-full" onClick={handleGoogle}>
                <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </Button>
            </>
          ) : (
            <form onSubmit={handleForgot} className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Enter your account email and we'll send you a password reset link.
              </div>
              <div>
                <Label htmlFor="forgot-email">Email</Label>
                <Input id="forgot-email" name="email" type="email" autoComplete="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={forgotSending}>
                {forgotSending ? "Sending..." : "Send reset link"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setForgotOpen(false)}>
                Back to sign in
              </Button>
            </form>
          )}
          <p className="text-center text-xs text-muted-foreground mt-4">
            <Link to="/" className="hover:underline">← Back home</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
