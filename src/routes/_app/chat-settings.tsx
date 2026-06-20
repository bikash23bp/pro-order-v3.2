import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Row = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  chat_force_popup: boolean;
};

export const Route = createFileRoute("/_app/chat-settings")({
  head: () => ({ meta: [{ title: "Chat Settings — OMS" }] }),
  component: ChatSettingsPage,
});

function ChatSettingsPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, chat_force_popup")
      .order("full_name", { ascending: true });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setRows(
      (data ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        chat_force_popup: (p as { chat_force_popup?: boolean }).chat_force_popup ?? false,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const toggleForcePopup = async (userId: string, value: boolean) => {
    setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, chat_force_popup: value } : r)));
    const { error } = await supabase.from("profiles").update({ chat_force_popup: value }).eq("id", userId);
    if (error) {
      toast.error(error.message);
      setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, chat_force_popup: !value } : r)));
      return;
    }
    toast.success(value ? "Force popup enabled" : "Force popup disabled");
  };

  if (!isAdmin) return null;

  const filtered = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (r.full_name ?? "").toLowerCase().includes(s) || (r.email ?? "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <MessageSquareWarning className="h-6 w-6 text-primary" />
          Chat Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Force chat popup forces a blocking modal in the middle of the screen when a new message arrives — the user must acknowledge or reply.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No users found.</div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9 shrink-0">
                      {r.avatar_url && <AvatarImage src={r.avatar_url} alt={r.full_name ?? r.email ?? "User"} loading="lazy" />}
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {(r.full_name || r.email || "U").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Label htmlFor={`${r.id}-popup`} className="cursor-pointer text-xs text-muted-foreground">
                      Force chat popup
                    </Label>
                    <Switch
                      id={`${r.id}-popup`}
                      checked={r.chat_force_popup}
                      onCheckedChange={(v) => toggleForcePopup(r.id, v)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
