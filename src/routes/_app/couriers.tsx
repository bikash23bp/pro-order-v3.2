import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, Search, KeyRound, ChevronRight, Wallet, Package, CheckCircle2, Star, Upload, MapPin } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getCouriersSummary } from "@/lib/courier-reports.functions";

function fmtMoney(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return `৳${Number(v).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}


type Courier = {
  id: string;
  name: string;
  base_url: string | null;
  api_key: string | null;
  secret_key: string | null;
  status: "active" | "inactive";
  is_default: boolean;
  kind: "api" | "local";
  logo_url: string | null;
};

export const Route = createFileRoute("/_app/couriers")({
  component: CouriersPage,
});

function mask(v: string | null) {
  if (!v) return "—";
  if (v.length <= 6) return "••••";
  return v.slice(0, 3) + "••••" + v.slice(-3);
}

function CouriersPage() {
  const { permissions, role } = useAuth();
  const canManageCouriers = role === "admin" || role === "business_owner" || !!permissions?.can_manage_couriers;
  const navigate = useNavigate();
  const [rows, setRows] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Courier | null>(null);


  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_courier_credentials");

    if (error) toast.error(error.message);
    setRows((data ?? []) as Courier[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const summaryFn = useServerFn(getCouriersSummary);
  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);
  const summary = useQuery({
    queryKey: ["couriers-summary", range.from, range.to, rows.length],
    queryFn: () => summaryFn({ data: range }),
    enabled: rows.length > 0,
  });
  const summaryMap = useMemo(() => {
    const m = new Map<string, { balance: { current: number | null; supported: boolean }; total: number; delivered: number; returned: number }>();
    for (const it of (summary.data?.items ?? []) as any[]) {
      m.set(it.courierId, it);
    }
    return m;
  }, [summary.data]);

  const filtered = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));


  const onDelete = async (id: string) => {
    if (!confirm("Delete this courier?")) return;
    const { error } = await supabase.from("couriers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Courier deleted");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Couriers</h1>
          <p className="text-sm text-muted-foreground">Manage delivery providers and their API credentials.</p>
        </div>
        {canManageCouriers && (
          <Dialog open={open && !editing} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(null)}><Plus className="h-4 w-4" />New Courier</Button>
            </DialogTrigger>
            <CourierForm editing={null} onClose={() => setOpen(false)} onSaved={load} />
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search couriers…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden lg:table-cell">Base URL</TableHead>
                <TableHead className="hidden xl:table-cell">API Key</TableHead>
                <TableHead className="hidden sm:table-cell">
                  <span className="inline-flex items-center gap-1"><Wallet className="h-3.5 w-3.5" />Balance</span>
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <span className="inline-flex items-center gap-1"><Package className="h-3.5 w-3.5" />Parcels (7d)</span>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Delivered</span>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No couriers yet.</TableCell></TableRow>
              ) : filtered.map((r) => {
                const s = summaryMap.get(r.id);
                const loadingSummary = summary.isLoading || (!s && summary.isFetching);
                const row = (
                  <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate({ to: "/couriers/$courierId", params: { courierId: r.id } })}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {r.logo_url ? (
                        <img src={r.logo_url} alt={r.name} className="h-6 w-6 rounded object-contain bg-muted/30" />
                      ) : r.kind === "local" ? (
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span>{r.name}</span>
                      {r.is_default && (
                        <Badge variant="outline" className="gap-1 border-amber-500/60 text-amber-500">
                          <Star className="h-3 w-3 fill-amber-500" />Default
                        </Badge>
                      )}
                      {r.kind === "local" && (
                        <Badge variant="secondary" className="text-[10px]">Local</Badge>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto md:hidden" />
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">{r.kind === "local" ? "—" : (r.base_url ?? "—")}</TableCell>
                  <TableCell className="hidden xl:table-cell font-mono text-xs">{mask(r.api_key)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {loadingSummary ? <Skeleton className="h-4 w-16" /> :
                      s?.balance.supported ? <span className="font-medium">{fmtMoney(s.balance.current)}</span> :
                      <span className="text-muted-foreground text-xs">N/A</span>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {loadingSummary ? <Skeleton className="h-4 w-10" /> : <span>{s?.total ?? 0}</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {loadingSummary ? <Skeleton className="h-4 w-10" /> : <span>{s?.delivered ?? 0}</span>}
                  </TableCell>
                  <TableCell><Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge></TableCell>

                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {canManageCouriers && (
                      <div className="inline-flex gap-1">
                        <Dialog open={open && editing?.id === r.id} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
                          <DialogTrigger asChild>
                            <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          {editing?.id === r.id && (
                            <CourierForm editing={editing} onClose={() => { setOpen(false); setEditing(null); }} onSaved={load} />
                          )}
                        </Dialog>
                        <Button size="icon" variant="ghost" onClick={() => onDelete(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
                );
                return row;
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CourierForm({
  editing, onClose, onSaved,
}: { editing: Courier | null; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<"api" | "local">(editing?.kind ?? "api");
  const [name, setName] = useState(editing?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(editing?.base_url ?? "https://portal.packzy.com/api/v1");
  const [apiKey, setApiKey] = useState(editing?.api_key ?? "");
  const [secretKey, setSecretKey] = useState(editing?.secret_key ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(editing?.status ?? "active");
  const [isDefault, setIsDefault] = useState<boolean>(editing?.is_default ?? false);
  const [logoUrl, setLogoUrl] = useState<string | null>(editing?.logo_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const onPickLogo = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("courier-logos").upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("courier-logos").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Logo upload failed");
    } finally { setUploading(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    const payload = {
      name: name.trim(),
      kind,
      base_url: kind === "local" ? null : (baseUrl.trim() || null),
      api_key: kind === "local" ? null : (apiKey.trim() || null),
      secret_key: kind === "local" ? null : (secretKey.trim() || null),
      logo_url: logoUrl,
      status,
      is_default: isDefault,
    };

    // If setting as default, clear any existing default first (partial unique idx).
    if (isDefault) {
      const q = supabase.from("couriers").update({ is_default: false }).eq("is_default", true);
      const { error: clearErr } = editing ? await q.neq("id", editing.id) : await q;
      if (clearErr) { setSaving(false); return toast.error(clearErr.message); }
    }

    const { error } = editing
      ? await supabase.from("couriers").update(payload).eq("id", editing.id)
      : await supabase.from("couriers").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Courier updated" : "Courier created");
    onSaved();
    onClose();
  };

  return (
    <DialogContent>
      <form onSubmit={submit} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Courier" : "New Courier"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as "api" | "local")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="api">API Courier (Steadfast etc.)</SelectItem>
                <SelectItem value="local">Local / In-store (Store Sales, Local Pickup…)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "local" ? "e.g. Store Sales, Local Pickup" : "e.g. Steadfast"} required />
          </div>

          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="logo" className="h-12 w-12 rounded border object-contain bg-muted/30" />
              ) : (
                <div className="h-12 w-12 rounded border grid place-items-center text-muted-foreground bg-muted/20">
                  <Upload className="h-4 w-4" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Input
                  type="file" accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickLogo(f); }}
                  disabled={uploading}
                />
                {logoUrl && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setLogoUrl(null)}>Remove</Button>
                )}
              </div>
            </div>
          </div>

          {kind === "api" && (
            <>
              <div className="space-y-2">
                <Label>Base URL</Label>
                <Input value={baseUrl ?? ""} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input value={apiKey ?? ""} onChange={(e) => setApiKey(e.target.value)} type="password" />
                </div>
                <div className="space-y-2">
                  <Label>Secret Key</Label>
                  <Input value={secretKey ?? ""} onChange={(e) => setSecretKey(e.target.value)} type="password" />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "active" | "inactive")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default courier</Label>
              <label className="flex items-center gap-2 h-10 rounded-md border px-3 cursor-pointer">
                <Checkbox checked={isDefault} onCheckedChange={(v) => setIsDefault(!!v)} />
                <span className="text-sm">Set as default for new orders</span>
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || uploading}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
