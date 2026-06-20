import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pause, Play, Coffee } from "lucide-react";
import { PauseAutoLockDialog, getPauseUntil, clearPause } from "@/components/PauseAutoLockDialog";

export function AutoLockControl() {
  const [pausedUntil, setPausedUntil] = useState<number | null>(() => getPauseUntil());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onChange = () => setPausedUntil(getPauseUntil());
    window.addEventListener("inactivity-pause-changed", onChange);
    const id = window.setInterval(() => {
      setPausedUntil(getPauseUntil());
      setTick((n) => n + 1);
    }, 30_000);
    return () => {
      window.removeEventListener("inactivity-pause-changed", onChange);
      window.clearInterval(id);
    };
  }, []);

  const isPaused = pausedUntil !== null && pausedUntil > Date.now();
  const minsLeft = isPaused ? Math.max(1, Math.round((pausedUntil - Date.now()) / 60_000)) : 0;

  if (isPaused) {
    return (
      <>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100 hover:text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400"
          onClick={() => clearPause()}
          title="Resume auto-lock"
        >
          <Play className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Resume</span>
          <span className="text-xs opacity-70">{minsLeft}m</span>
        </Button>
      </>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => setDialogOpen(true)}
        title="Pause auto-lock"
      >
        <Coffee className="h-4 w-4" />
        <span className="hidden sm:inline">Pause</span>
      </Button>
      <PauseAutoLockDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
