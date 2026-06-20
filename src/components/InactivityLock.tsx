import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Lock, Coffee, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getPauseUntil, getPauseReason, clearPause } from "@/components/PauseAutoLockDialog";

export function InactivityLock() {
  const { profile, user } = useAuth();
  const enabled = profile?.inactivity_lock_enabled ?? false;
  const timeoutMs = Math.max(10, profile?.inactivity_lock_seconds ?? 1800) * 1000;

  const [locked, setLocked] = useState(false);
  const timerRef = useRef<number | null>(null);
  const eventIdRef = useRef<string | null>(null);
  const lockedAtRef = useRef<number | null>(null);

  // Log lock event when becoming locked
  useEffect(() => {
    if (!locked || !user?.id) return;
    let cancelled = false;
    lockedAtRef.current = Date.now();
    (async () => {
      const { data, error } = await supabase
        .from("inactivity_lock_events")
        .insert({ user_id: user.id })
        .select("id")
        .single();
      if (!cancelled && !error && data) eventIdRef.current = data.id;
    })();
    return () => {
      cancelled = true;
    };
  }, [locked, user?.id]);

  const handleUnlock = async () => {
    const id = eventIdRef.current;
    const startedAt = lockedAtRef.current;
    eventIdRef.current = null;
    lockedAtRef.current = null;
    setLocked(false);
    if (id && startedAt) {
      const duration = Math.round((Date.now() - startedAt) / 1000);
      await supabase
        .from("inactivity_lock_events")
        .update({ unlocked_at: new Date().toISOString(), duration_seconds: duration })
        .eq("id", id);
    }
  };

  const [pausedUntil, setPausedUntil] = useState<number | null>(() => getPauseUntil());
  const [, setTick] = useState(0);

  // Listen for pause changes + tick every 30s to expire
  useEffect(() => {
    const onChange = () => setPausedUntil(getPauseUntil());
    window.addEventListener("inactivity-pause-changed", onChange);
    const id = window.setInterval(() => {
      const v = getPauseUntil();
      setPausedUntil(v);
      setTick((n) => n + 1);
    }, 30_000);
    return () => {
      window.removeEventListener("inactivity-pause-changed", onChange);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      return;
    }
    if (pausedUntil && pausedUntil > Date.now()) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      return;
    }

    const reset = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setLocked(true), timeoutMs);
    };

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];

    let last = 0;
    const handler = () => {
      if (locked) return;
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      reset();
    };

    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    if (!locked) reset();

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [enabled, timeoutMs, locked, pausedUntil]);

  // Pause active → full-screen lock (block all interactions until user resumes)
  if (pausedUntil && pausedUntil > Date.now()) {
    const reason = getPauseReason();
    const msLeft = pausedUntil - Date.now();
    const minsLeft = Math.max(1, Math.round(msLeft / 60_000));
    return (
      <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 text-center px-6 max-w-md">
          <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
            <Coffee className="h-10 w-10 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Paused</h2>
            {reason && <p className="text-lg font-medium">{reason}</p>}
            <p className="text-muted-foreground">
              {minsLeft} মিনিট বাকি · কাজে ফিরতে Resume চাপুন
            </p>
          </div>
          <Button size="lg" onClick={() => clearPause()}>
            <X className="h-4 w-4 mr-2" /> Resume
          </Button>
        </div>
      </div>
    );
  }

  if (!enabled || !locked) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center px-6">
        <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
          <Lock className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">You're inactive</h2>
          <p className="text-muted-foreground max-w-sm">
            Session locked due to inactivity. Click below to resume.
          </p>
        </div>
        <Button size="lg" onClick={handleUnlock}>
          Active
        </Button>
      </div>
    </div>
  );
}
