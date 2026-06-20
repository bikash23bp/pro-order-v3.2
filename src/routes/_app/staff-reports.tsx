import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Clock, Users as UsersIcon, Activity, RefreshCw } from "lucide-react";
import { StaffTabs } from "@/components/staff-tabs";

export const Route = createFileRoute("/_app/staff-reports")({
  head: () => ({ meta: [{ title: "Staff Activity Report — OMS" }] }),
  component: StaffReportsPage,
});

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type Session = {
  id: string;
  user_id: string;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
};

type Preset = "today" | "yesterday" | "week" | "month" | "custom";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function toInputDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromInputDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function fmtDuration(secs: number) {
  if (!secs || secs < 0) secs = 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${secs}s`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function computeRange(preset: Preset, from: Date, to: Date): { from: Date; to: Date } {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (preset === "week") {
    const f = new Date(now);
    f.setDate(f.getDate() - 6);
    return { from: startOfDay(f), to: endOfDay(now) };
  }
  if (preset === "month") {
    const f = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: startOfDay(f), to: endOfDay(now) };
  }
  return { from: startOfDay(from), to: endOfDay(to) };
}

function StaffReportsPage() {
  const [preset, setPreset] = useState<Preset>("today");
  const today = new Date();
  const [fromDate, setFromDate] = useState<string>(toInputDate(today));
  const [toDate, setToDate] = useState<string>(toInputDate(today));
  const [staffFilter, setStaffFilter] = useState<string>("all");

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);

  const range = useMemo(
    () => computeRange(preset, fromInputDate(fromDate), fromInputDate(toDate)),
    [preset, fromDate, toDate],
  );

  async function load() {
    setLoading(true);
    try {
      // Close any stale open sessions so totals are accurate
      await supabase.rpc("close_stale_staff_sessions");

      const [{ data: profs }, { data: sess }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .order("full_name", { ascending: true }),
        supabase
          .from("staff_sessions")
          .select("id, user_id, started_at, last_seen_at, ended_at, duration_seconds")
          .gte("started_at", range.from.toISOString())
          .lte("started_at", range.to.toISOString())
          .order("started_at", { ascending: false })
          .limit(5000),
      ]);
      setProfiles(profs ?? []);
      setSessions(sess ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from.getTime(), range.to.getTime()]);

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  // Aggregate per user
  type Agg = {
    user: Profile | { id: string; full_name: null; email: null; avatar_url: null };
    sessions: Session[];
    totalSeconds: number;
    sessionCount: number;
  };

  const aggregates: Agg[] = useMemo(() => {
    const byUser = new Map<string, Agg>();
    for (const s of sessions) {
      const sec =
        s.duration_seconds ??
        Math.max(
          0,
          Math.floor(
            ((s.ended_at ? new Date(s.ended_at).getTime() : new Date(s.last_seen_at).getTime()) -
              new Date(s.started_at).getTime()) /
              1000,
          ),
        );
      let a = byUser.get(s.user_id);
      if (!a) {
        a = {
          user: profileMap.get(s.user_id) ?? {
            id: s.user_id,
            full_name: null,
            email: null,
            avatar_url: null,
          },
          sessions: [],
          totalSeconds: 0,
          sessionCount: 0,
        };
        byUser.set(s.user_id, a);
      }
      a.sessions.push(s);
      a.totalSeconds += sec;
      a.sessionCount += 1;
    }
    return Array.from(byUser.values()).sort((a, b) => b.totalSeconds - a.totalSeconds);
  }, [sessions, profileMap]);

  const filtered = useMemo(
    () => (staffFilter === "all" ? aggregates : aggregates.filter((a) => a.user.id === staffFilter)),
    [aggregates, staffFilter],
  );

  const totals = useMemo(() => {
    const totalSeconds = filtered.reduce((s, a) => s + a.totalSeconds, 0);
    const totalSessions = filtered.reduce((s, a) => s + a.sessionCount, 0);
    return { totalSeconds, totalSessions, activeStaff: filtered.length };
  }, [filtered]);

  return (
    <div className="p-6 space-y-6">
      <StaffTabs />
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Staff Activity Report</h1>
          <p className="text-sm text-muted-foreground">
            Login sessions, login count, and active hours per staff.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label>Range</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="week">Last 7 days</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <>
              <div className="space-y-1">
                <Label>From</Label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label>Staff</Label>
            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email || p.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            {fmtDate(range.from.toISOString())} → {fmtDate(range.to.toISOString())}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UsersIcon className="h-4 w-4" /> Active staff
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{totals.activeStaff}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" /> Total logins
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{totals.totalSessions}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" /> Total active time
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{fmtDuration(totals.totalSeconds)}</div></CardContent>
        </Card>
      </div>

      {/* Per-staff summary table */}
      <Card>
        <CardHeader><CardTitle>Per-staff summary</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead className="text-right">Logins</TableHead>
                <TableHead className="text-right">Active time</TableHead>
                <TableHead className="text-right">Avg / login</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No activity in selected range.
                </TableCell></TableRow>
              )}
              {filtered.map((a) => (
                <TableRow key={a.user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        {a.user.avatar_url && <AvatarImage src={a.user.avatar_url} />}
                        <AvatarFallback className="text-[10px]">
                          {(a.user.full_name || a.user.email || "U").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{a.user.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{a.user.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{a.sessionCount}</TableCell>
                  <TableCell className="text-right font-semibold">{fmtDuration(a.totalSeconds)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fmtDuration(Math.floor(a.totalSeconds / Math.max(1, a.sessionCount)))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Session timeline */}
      <Card>
        <CardHeader><CardTitle>Session timeline</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.flatMap((a) => a.sessions).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No sessions.
                </TableCell></TableRow>
              )}
              {filtered
                .flatMap((a) => a.sessions.map((s) => ({ s, u: a.user })))
                .sort((x, y) => new Date(y.s.started_at).getTime() - new Date(x.s.started_at).getTime())
                .slice(0, 500)
                .map(({ s, u }) => {
                  const open = !s.ended_at;
                  const sec =
                    s.duration_seconds ??
                    Math.max(
                      0,
                      Math.floor(
                        ((open ? new Date(s.last_seen_at).getTime() : new Date(s.ended_at!).getTime()) -
                          new Date(s.started_at).getTime()) /
                          1000,
                      ),
                    );
                  return (
                    <TableRow key={s.id}>
                      <TableCell>{u.full_name || u.email || "—"}</TableCell>
                      <TableCell>{fmtDate(s.started_at)}</TableCell>
                      <TableCell>{fmtTime(s.started_at)}</TableCell>
                      <TableCell>{open ? "—" : fmtTime(s.ended_at!)}</TableCell>
                      <TableCell className="text-right">{fmtDuration(sec)}</TableCell>
                      <TableCell>
                        {open ? (
                          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Closed</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
