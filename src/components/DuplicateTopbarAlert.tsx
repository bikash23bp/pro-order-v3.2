import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDuplicatePhones } from "@/lib/duplicates.functions";

/**
 * Topbar alert: red button visible only when duplicate active orders exist.
 * Clicking jumps to the orders list where the rows are flagged with a red
 * Duplicate badge.
 */
export function DuplicateTopbarAlert() {
  const fetchDupes = useServerFn(getDuplicatePhones);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetchDupes();
        if (alive) setCount(r.phones?.length ?? 0);
      } catch {/* ignore */}
    };
    load();
    const id = window.setInterval(load, 60_000);
    const onFocus = () => load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    const onOrdersChanged = () => load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("orders:changed", onOrdersChanged);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("orders:changed", onOrdersChanged);
    };
  }, [fetchDupes]);


  if (count === 0) return null;

  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className="gap-1 border-red-500/60 bg-red-500/15 text-red-500 hover:bg-red-500/25 hover:text-red-500"
      title={`${count} duplicate phone${count === 1 ? "" : "s"} in active orders`}
    >
      <Link to="/orders" search={{ status: "all", dup: true, page: 1, limit: 50 } as never}>
        <AlertTriangle className="h-4 w-4" />
        <span className="hidden md:inline">Duplicates</span>
        <span className="font-semibold tabular-nums">{count}</span>
      </Link>
    </Button>
  );
}
