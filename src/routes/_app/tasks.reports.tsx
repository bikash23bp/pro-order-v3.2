import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, BarChart3, Loader2, RefreshCw } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/tasks/reports")({
  head: () => ({ meta: [{ title: "Task Reports — OMS" }] }),
  component: TaskReportsPage,
});

type StatRow = {
  user_id: string;
  display_name: string;
  pending: number;
  on_hold: number;
  completed: number;
  total: number;
  avg_completion_seconds: number | null;
};

function fmtDuration(secs: number | null) {
  if (secs == null) return "—";
  const s = Math.round(secs);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return mm ? `${h}h ${mm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh ? `${d}d ${hh}h` : `${d}d`;
}

function toIsoStart(d: string) {
  return new Date(`${d}T00:00:00`).toISOString();
}
function toIsoEnd(d: string) {
  const dt = new Date(`${d}T00:00:00`);
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString();
}

function TaskReportsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const userId = user?.id ?? null;

  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 29);

  const [from, setFrom] = useState(format(monthAgo, "yyyy-MM-dd"));
  const [to, setTo] = useState(format(today, "yyyy-MM-dd"));
  const [sortBy, setSortBy] = useState<"total" | "pending" | "name">("total");

  useEffect(() => {
    if (!userId) return;
    let scheduled = false;
    const ping = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        qc.invalidateQueries({ queryKey: ["task-stats"] });
      }, 1500);
    };
    const ch = supabase
      .channel(`tasks-reports-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, ping)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);


  const statsQuery = useQuery({
    queryKey: ["task-stats", from, to],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("task_assignment_stats", {
        p_from: toIsoStart(from),
        p_to: toIsoEnd(to),
      });
      if (error) throw error;
      return (data ?? []) as StatRow[];
    },
  });

  const rows = useMemo(() => {
    const list = [...(statsQuery.data ?? [])];
    list.sort((a, b) => {
      if (sortBy === "name") return a.display_name.localeCompare(b.display_name);
      if (sortBy === "pending") return b.pending - a.pending;
      return b.total - a.total;
    });
    return list;
  }, [statsQuery.data, sortBy]);

  const kpis = useMemo(() => {
    const list = statsQuery.data ?? [];
    const total = list.reduce((s, r) => s + r.total, 0);
    const pending = list.reduce((s, r) => s + r.pending, 0);
    const on_hold = list.reduce((s, r) => s + r.on_hold, 0);
    const completed = list.reduce((s, r) => s + r.completed, 0);
    const completers = list.filter((r) => r.avg_completion_seconds != null && r.completed > 0);
    const avg = completers.length
      ? completers.reduce((s, r) => s + (r.avg_completion_seconds ?? 0) * r.completed, 0) /
        completers.reduce((s, r) => s + r.completed, 0)
      : null;
    return { total, pending, on_hold, completed, avg };
  }, [statsQuery.data]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/tasks"><ArrowLeft className="h-4 w-4 mr-1" /> Tasks</Link>
          </Button>
          <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary/15 text-primary">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Task Reports</h1>
            <p className="text-xs text-muted-foreground">Per-user load & completion times.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => statsQuery.refetch()}>
          <RefreshCw className={`h-4 w-4 ${statsQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground block mb-1">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground block mb-1">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant={sortBy === "total" ? "default" : "outline"} onClick={() => setSortBy("total")}>Sort: Total</Button>
            <Button size="sm" variant={sortBy === "pending" ? "default" : "outline"} onClick={() => setSortBy("pending")}>Pending</Button>
            <Button size="sm" variant={sortBy === "name" ? "default" : "outline"} onClick={() => setSortBy("name")}>Name</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          { label: "Total", val: kpis.total, tone: "" },
          { label: "Pending", val: kpis.pending, tone: "text-rose-300" },
          { label: "On Hold", val: kpis.on_hold, tone: "text-amber-300" },
          { label: "Completed", val: kpis.completed, tone: "text-emerald-300" },
          { label: "Avg Time", val: fmtDuration(kpis.avg), tone: "" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
              <div className={`text-xl font-semibold ${k.tone}`}>{k.val}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Per-user load</CardTitle></CardHeader>
        <CardContent className="p-0">
          {statsQuery.isLoading ? (
            <div className="grid place-items-center p-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No data in this range.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/30">
                  <tr>
                    <th className="text-left p-2">User</th>
                    <th className="text-right p-2">Pending</th>
                    <th className="text-right p-2">On Hold</th>
                    <th className="text-right p-2">Done</th>
                    <th className="text-right p-2">Total</th>
                    <th className="text-right p-2">Avg time</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.user_id}
                      className="border-t border-border/50 hover:bg-muted/30 cursor-pointer"
                      onClick={() =>
                        navigate({ to: "/tasks", search: { user: r.user_id } as never })
                      }
                    >
                      <td className="p-2 font-medium">{r.display_name}</td>
                      <td className="p-2 text-right">
                        {r.pending > 0
                          ? <Badge variant="outline" className="bg-rose-500/15 text-rose-300 border-rose-500/30">{r.pending}</Badge>
                          : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="p-2 text-right">
                        {r.on_hold > 0
                          ? <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30">{r.on_hold}</Badge>
                          : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="p-2 text-right text-emerald-300">{r.completed}</td>
                      <td className="p-2 text-right font-semibold">{r.total}</td>
                      <td className="p-2 text-right text-muted-foreground">{fmtDuration(r.avg_completion_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
