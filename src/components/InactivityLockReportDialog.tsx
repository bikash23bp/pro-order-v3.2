import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Preset = "today" | "7d" | "30d" | "custom";

type Row = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  lock_count: number;
  total_seconds: number;
};

function presetRange(p: Exclude<Preset, "custom">): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  if (p === "today") {
    from.setHours(0, 0, 0, 0);
  } else if (p === "7d") {
    from.setDate(from.getDate() - 7);
  } else {
    from.setDate(from.getDate() - 30);
  }
  return { from, to };
}

function fmtDuration(s: number) {
  if (!s) return "0m";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function InactivityLockReportDialog() {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>("today");
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    let from: Date;
    let to: Date;
    if (preset === "custom") {
      if (!fromDate || !toDate) {
        setLoading(false);
        return;
      }
      from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
    } else {
      const r = presetRange(preset);
      from = r.from;
      to = r.to;
    }

    const [{ data: events, error: e1 }, { data: profiles, error: e2 }] = await Promise.all([
      supabase
        .from("inactivity_lock_events")
        .select("user_id, duration_seconds, locked_at")
        .gte("locked_at", from.toISOString())
        .lte("locked_at", to.toISOString()),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    if (e1 || e2) {
      toast.error((e1 || e2)!.message);
      setLoading(false);
      return;
    }
    const map = new Map<string, Row>();
    for (const p of profiles ?? []) {
      map.set(p.id, {
        user_id: p.id,
        full_name: p.full_name,
        email: p.email,
        lock_count: 0,
        total_seconds: 0,
      });
    }
    for (const ev of events ?? []) {
      const r = map.get(ev.user_id) ?? {
        user_id: ev.user_id,
        full_name: null,
        email: null,
        lock_count: 0,
        total_seconds: 0,
      };
      r.lock_count += 1;
      r.total_seconds += ev.duration_seconds ?? 0;
      map.set(ev.user_id, r);
    }
    const list = [...map.values()]
      .filter((r) => r.lock_count > 0)
      .sort((a, b) => b.lock_count - a.lock_count);
    setRows(list);
    setLoading(false);
  }

  useEffect(() => {
    if (!open) return;
    if (preset === "custom" && (!fromDate || !toDate)) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset, fromDate, toDate]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Activity className="h-4 w-4 mr-1.5" />
          Inactivity report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Inactivity Lock Report</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {(["today", "7d", "30d", "custom"] as Preset[]).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={preset === r ? "default" : "outline"}
              onClick={() => setPreset(r)}
            >
              {r === "today" ? "Today" : r === "7d" ? "7 days" : r === "30d" ? "30 days" : "Custom"}
            </Button>
          ))}
          {preset === "custom" && (
            <div className="flex items-center gap-1.5 ml-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("justify-start text-left font-normal", !fromDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-1.5 h-4 w-4" />
                    {fromDate ? format(fromDate, "PP") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fromDate}
                    onSelect={setFromDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground text-sm">→</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("justify-start text-left font-normal", !toDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-1.5 h-4 w-4" />
                    {toDate ? format(toDate, "PP") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={toDate}
                    onSelect={setToDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
        <div className="max-h-[60vh] overflow-auto">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : preset === "custom" && (!fromDate || !toDate) ? (
            <div className="p-6 text-sm text-muted-foreground">Pick both From and To dates.</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No lock events in this range.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="w-24 text-right">Locks</TableHead>
                  <TableHead className="w-32 text-right">Total locked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell>
                      <div className="font-medium">{r.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.email ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.lock_count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtDuration(r.total_seconds)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
