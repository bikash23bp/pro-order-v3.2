import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Users as UsersIcon, Circle, Lock } from "lucide-react";
import { StaffTabs } from "@/components/staff-tabs";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/staff-live")({
  head: () => ({ meta: [{ title: "Staff Live Dashboard — OMS" }] }),
  component: StaffLivePage,
});

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  last_seen_at: string | null;
  is_blocked: boolean;
};

const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RECENT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

function statusFor(lastSeen: string | null, now: number) {
  if (!lastSeen) return { label: "Never", tone: "muted" as const };
  const diff = now - new Date(lastSeen).getTime();
  if (diff <= ONLINE_WINDOW_MS) return { label: "Online", tone: "online" as const };
  if (diff <= RECENT_WINDOW_MS) return { label: "Recently active", tone: "recent" as const };
  return { label: "Offline", tone: "muted" as const };
}

function formatAgo(lastSeen: string | null, now: number) {
  if (!lastSeen) return "—";
  const diff = Math.max(0, now - new Date(lastSeen).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function StaffLivePage() {
  const { isAdmin, role, user } = useAuth();
  const canRemoteLock = isAdmin || role === "business_owner";
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  async function load() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url, last_seen_at, is_blocked")
      .order("last_seen_at", { ascending: false, nullsFirst: false });
    if (!error && data) setRows(data as Row[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const refetch = window.setInterval(load, 30_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(refetch); window.clearInterval(tick); };
  }, []);

  const online = rows.filter((r) => statusFor(r.last_seen_at, now).tone === "online");
  const recent = rows.filter((r) => statusFor(r.last_seen_at, now).tone === "recent");

  return (
    <div className="space-y-6">
      <StaffTabs />
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" /> Staff Live Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          এখন কোন কর্মী active তা real-time দেখুন (প্রতি ৯০ সেকেন্ডে heartbeat আপডেট হয়)
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Online এখন</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold text-emerald-600">{online.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Recently active (৩০ মিনিট)</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold text-amber-600">{recent.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">মোট কর্মী</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold flex items-center gap-2"><UsersIcon className="h-6 w-6 text-muted-foreground" />{rows.length}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>All Staff</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  {canRemoteLock && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const s = statusFor(r.last_seen_at, now);
                  const isSelf = r.id === user?.id;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={r.avatar_url ?? undefined} />
                            <AvatarFallback>{(r.full_name ?? r.email ?? "?").slice(0, 1).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{r.full_name ?? "—"}</div>
                            {r.is_blocked && <Badge variant="destructive" className="text-[10px]">Blocked</Badge>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <Circle
                            className={
                              s.tone === "online" ? "h-2.5 w-2.5 fill-emerald-500 text-emerald-500" :
                              s.tone === "recent" ? "h-2.5 w-2.5 fill-amber-500 text-amber-500" :
                              "h-2.5 w-2.5 fill-muted-foreground text-muted-foreground"
                            }
                          />
                          {s.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatAgo(r.last_seen_at, now)}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{r.email ?? "—"}</TableCell>
                      {canRemoteLock && (
                        <TableCell className="text-right">
                          {!isSelf && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                const { error } = await supabase.rpc("admin_lock_user_screen", { target: r.id });
                                if (error) toast.error(error.message);
                                else toast.success(`${r.full_name ?? r.email ?? "User"} এর স্ক্রীন লক করা হয়েছে`);
                              }}
                            >
                              <Lock className="h-3.5 w-3.5 mr-1" /> Lock
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={canRemoteLock ? 5 : 4} className="text-center text-sm text-muted-foreground py-6">No staff found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
