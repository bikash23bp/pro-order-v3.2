import { useEffect, useRef, useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Full-screen lock triggered remotely by an admin / business owner.
 * Listens to profiles.screen_locked_at for the current user via realtime;
 * to unlock the user must re-enter their password.
 */
export function RemoteLock() {
  const { user, profile } = useAuth();
  const [lockedAt, setLockedAt] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const initializedRef = useRef(false);

  // Initial fetch
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("screen_locked_at")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setLockedAt((data as { screen_locked_at?: string | null } | null)?.screen_locked_at ?? null);
        initializedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`remote-lock-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => {
          const next = (payload.new as { screen_locked_at?: string | null } | null)?.screen_locked_at ?? null;
          setLockedAt(next);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = profile?.email || user?.email;
    if (!email) { toast.error("No email on profile"); return; }
    if (!password) return;
    setBusy(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) {
        toast.error("পাসওয়ার্ড ভুল");
        return;
      }
      const { error: rpcErr } = await supabase.rpc("unlock_my_screen");
      if (rpcErr) {
        toast.error(rpcErr.message);
        return;
      }
      setPassword("");
      setLockedAt(null);
      toast.success("Unlocked");
    } finally {
      setBusy(false);
    }
  };

  if (!lockedAt) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-background/95 backdrop-blur-md flex items-center justify-center p-4">
      <form onSubmit={handleUnlock} className="flex flex-col items-center gap-5 text-center max-w-sm w-full">
        <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <Lock className="h-10 w-10 text-destructive" />
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">স্ক্রীন লক করা হয়েছে</h2>
          <p className="text-sm text-muted-foreground">
            অ্যাডমিন আপনার স্ক্রীন লক করেছেন। আনলক করতে আপনার পাসওয়ার্ড দিন।
          </p>
        </div>
        <div className="w-full space-y-2 text-left">
          <Label htmlFor="remote-lock-pwd">পাসওয়ার্ড</Label>
          <Input
            id="remote-lock-pwd"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy || !password}>
          {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Unlock
        </Button>
      </form>
    </div>
  );
}
