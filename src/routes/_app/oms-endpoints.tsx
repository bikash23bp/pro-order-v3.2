import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Send, Copy, ArrowLeft, Loader2, Inbox, Network } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  listOmsDestinations,
  upsertOmsDestination,
  deleteOmsDestination,
  listOmsInbound,
  upsertOmsInbound,
  deleteOmsInbound,
  getOmsInboundUrl,
  listOmsForwardLogs,
  listAllowedProductsForSender,
  setAllowedProductsForSender,
  listAllProductsForPicker,
  type OmsDestination,
  type OmsInboundSetting,
  type OmsAllowedProduct,
} from "@/lib/oms-endpoints.functions";
import { testOmsDestination } from "@/lib/oms-forward.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { Package } from "lucide-react";

export const Route = createFileRoute("/_app/oms-endpoints")({
  head: () => ({ meta: [{ title: "OMS Endpoints — OMS" }] }),
  component: Page,
});

function randomToken(len = 40) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  const arr = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

function Page() {
  const { permissions, role } = useAuth();
  const allowed =
    role === "admin" ||
    role === "business_owner" ||
    role === "manager" ||
    !!permissions?.can_manage_oms_endpoints;

  if (!allowed) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-2">OMS Endpoints</h1>
        <p className="text-muted-foreground">আপনার এই পেজে প্রবেশের অনুমতি নেই।</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/settings"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">OMS Endpoints</h1>
          <p className="text-sm text-muted-foreground">অন্য OMS-এ অর্ডার পাঠানো ও গ্রহণ করার সেটআপ</p>
        </div>
      </div>

      <DestinationsCard />
      <InboundCard />
      <LogsCard />
    </div>
  );
}

// ===== Destinations =====

function DestinationsCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOmsDestinations);
  const upsertFn = useServerFn(upsertOmsDestination);
  const deleteFn = useServerFn(deleteOmsDestination);
  const testFn = useServerFn(testOmsDestination);

  const q = useQuery({ queryKey: ["oms-destinations"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<Partial<OmsDestination> | null>(null);
  const [open, setOpen] = useState(false);

  const startNew = () => {
    setEditing({ name: "", url: "", products_url: "", api_token: randomToken(), auto_forward: false, active: true });
    setOpen(true);
  };
  const startEdit = (d: OmsDestination) => {
    setEditing({ ...d, products_url: d.products_url ?? "" });
    setOpen(true);
  };

  const save = async () => {
    if (!editing?.name?.trim() || !editing?.url?.trim() || !editing?.api_token) {
      toast.error("Name, Order Inbound URL, এবং Token দরকার");
      return;
    }
    try {
      await upsertFn({ data: {
        id: editing.id,
        name: editing.name.trim(),
        url: editing.url.trim(),
        products_url: editing.products_url?.trim() ? editing.products_url.trim() : null,
        api_token: editing.api_token,
        auto_forward: !!editing.auto_forward,
        active: editing.active !== false,
      } });
      toast.success("Destination saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["oms-destinations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this destination?")) return;
    await deleteFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["oms-destinations"] });
  };

  const test = async (d: OmsDestination) => {
    toast.info(`Testing ${d.name}…`);
    const r = await testFn({ data: { url: d.url, api_token: d.api_token } });
    if (r.ok) toast.success(`OK (HTTP ${r.status})`);
    else toast.error(`Failed (HTTP ${r.status}): ${r.body.slice(0, 120)}`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2"><Send className="h-4 w-4" />OMS Destinations</CardTitle>
          <CardDescription>যেসব OMS-এ আপনি অর্ডার পাঠাবেন</CardDescription>
        </div>
        <Button onClick={startNew} size="sm"><Plus className="h-4 w-4" />Add</Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Auto</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
            ) : (q.data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No destinations yet.</TableCell></TableRow>
            ) : (q.data ?? []).map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="font-mono text-xs truncate max-w-[280px]">{d.url}</TableCell>
                <TableCell>{d.auto_forward ? <Badge>Auto</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                <TableCell>{d.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Off</Badge>}</TableCell>
                <TableCell className="text-right space-x-2 whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => test(d)}>Test</Button>
                  <Button size="sm" variant="ghost" onClick={() => startEdit(d)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "Add"} Destination</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name (যে OMS-এ পাঠাবেন)</Label>
              <Input value={editing?.name ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, name: e.target.value }))} placeholder="Partner OMS A" />
            </div>

            <div className="space-y-1.5"><Label>Partner Base URL → Auto-fill</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://their-oms.com"
                  onChange={(e) => {
                    const base = e.target.value.trim().replace(/\/+$/, "");
                    if (!base) return;
                    setEditing((p) => ({
                      ...p!,
                      url: `${base}/api/public/oms-inbound`,
                      products_url: `${base}/api/public/oms-products`,
                    }));
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Partner-এর base URL দিন — নিচের দুটো URL auto-fill হবে।</p>
            </div>

            <div className="space-y-1.5"><Label>Order Inbound URL (partner-কে দিন)</Label>
              <Input
                className="font-mono text-xs"
                value={editing?.url ?? ""}
                onChange={(e) => setEditing((p) => ({ ...p!, url: e.target.value }))}
                placeholder="https://their-oms.com/api/public/oms-inbound"
              />
              <p className="text-xs text-muted-foreground">এখানে আমরা order POST করব।</p>
            </div>

            <div className="space-y-1.5"><Label>Product Sync URL (partner GET করবে এই URL-এ X-OMS-Token সহ)</Label>
              <Input
                className="font-mono text-xs"
                value={editing?.products_url ?? ""}
                onChange={(e) => setEditing((p) => ({ ...p!, products_url: e.target.value }))}
                placeholder="https://their-oms.com/api/public/oms-products"
              />
              <p className="text-xs text-muted-foreground">Optional — partner থেকে প্রোডাক্ট pull করতে চাইলে।</p>
            </div>

            <div className="space-y-1.5"><Label>API Token (X-OMS-Token header হিসেবে যাবে)</Label>
              <div className="flex gap-2">
                <Input className="font-mono" value={editing?.api_token ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, api_token: e.target.value }))} />
                <Button type="button" variant="outline" onClick={() => setEditing((p) => ({ ...p!, api_token: randomToken() }))}>Regen</Button>
              </div>
              <p className="text-xs text-muted-foreground">Partner OMS-এ "Inbound Senders"-এ এই token যোগ করতে হবে।</p>
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <div><Label>Auto-forward</Label><p className="text-xs text-muted-foreground">নতুন অর্ডার তৈরি হলেই auto-forward</p></div>
              <Switch checked={!!editing?.auto_forward} onCheckedChange={(v) => setEditing((p) => ({ ...p!, auto_forward: v }))} />
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <div><Label>Active</Label></div>
              <Switch checked={editing?.active !== false} onCheckedChange={(v) => setEditing((p) => ({ ...p!, active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ===== Inbound =====

function InboundCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOmsInbound);
  const upsertFn = useServerFn(upsertOmsInbound);
  const deleteFn = useServerFn(deleteOmsInbound);
  const urlFn = useServerFn(getOmsInboundUrl);

  const q = useQuery({ queryKey: ["oms-inbound"], queryFn: () => listFn() });
  const urlQ = useQuery({ queryKey: ["oms-inbound-url"], queryFn: () => urlFn() });
  const couriersQ = useQuery({
    queryKey: ["couriers-active-list"],
    queryFn: async () => {
      const { data } = await supabase.from("couriers").select("id, name").eq("status", "active").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const [editing, setEditing] = useState<Partial<OmsInboundSetting> | null>(null);
  const [open, setOpen] = useState(false);
  const [productsForSender, setProductsForSender] = useState<OmsInboundSetting | null>(null);


  const startNew = () => { setEditing({ sender_name: "", api_token: randomToken(), active: true, default_courier_id: null }); setOpen(true); };
  const startEdit = (d: OmsInboundSetting) => { setEditing({ ...d }); setOpen(true); };

  const save = async () => {
    if (!editing?.sender_name?.trim() || !editing?.api_token) return toast.error("Name এবং Token দরকার");
    try {
      await upsertFn({ data: {
        id: editing.id,
        sender_name: editing.sender_name.trim(),
        api_token: editing.api_token,
        active: editing.active !== false,
        default_courier_id: editing.default_courier_id ?? null,
      } });
      toast.success("Saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["oms-inbound"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this inbound sender?")) return;
    await deleteFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["oms-inbound"] });
  };

  const copy = async (text: string) => { await navigator.clipboard.writeText(text); toast.success("Copied"); };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2"><Inbox className="h-4 w-4" />Inbound Senders</CardTitle>
          <CardDescription>যেসব OMS আপনাকে অর্ডার পাঠাতে পারবে — প্রত্যেককে আলাদা token দিন</CardDescription>
        </div>
        <Button onClick={startNew} size="sm"><Plus className="h-4 w-4" />Add</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 bg-muted/30 space-y-2">
          <div>
            <div className="text-xs font-medium mb-1">Order Inbound URL (partner-কে দিন)</div>
            <div className="flex items-center gap-2">
              <Input readOnly value={urlQ.data?.url ?? ""} className="font-mono text-xs" />
              <Button size="sm" variant="outline" onClick={() => copy(urlQ.data?.url ?? "")}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium mb-1">Product Sync URL (partner GET করবে এই URL-এ X-OMS-Token সহ)</div>
            <div className="flex items-center gap-2">
              <Input readOnly value={urlQ.data?.products_url ?? ""} className="font-mono text-xs" />
              <Button size="sm" variant="outline" onClick={() => copy(urlQ.data?.products_url ?? "")}><Copy className="h-4 w-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Partner কেবল তার জন্য allow-করা প্রোডাক্টগুলোই পাবে।</p>
          </div>
        </div>


        <Table>
          <TableHeader><TableRow>
            <TableHead>Sender Name</TableHead><TableHead>Token</TableHead><TableHead>Default Courier</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
            ) : (q.data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No inbound senders.</TableCell></TableRow>
            ) : (q.data ?? []).map((d) => {
              const cname = (couriersQ.data ?? []).find((c) => c.id === d.default_courier_id)?.name;
              return (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.sender_name}</TableCell>
                <TableCell className="font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <span className="truncate max-w-[200px]">{d.api_token}</span>
                    <Button size="sm" variant="ghost" onClick={() => copy(d.api_token)}><Copy className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
                <TableCell className="text-xs">{cname ? <Badge variant="outline">{cname}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>{d.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Off</Badge>}</TableCell>
                <TableCell className="text-right space-x-1 whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setProductsForSender(d)}><Package className="h-4 w-4 mr-1" />Products</Button>
                  <Button size="sm" variant="ghost" onClick={() => startEdit(d)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>

              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "Add"} Inbound Sender</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Sender Name (partner-এর নাম)</Label>
              <Input value={editing?.sender_name ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, sender_name: e.target.value }))} placeholder="Partner OMS B" />
            </div>
            <div className="space-y-1.5"><Label>API Token</Label>
              <div className="flex gap-2">
                <Input className="font-mono" value={editing?.api_token ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, api_token: e.target.value }))} />
                <Button type="button" variant="outline" onClick={() => setEditing((p) => ({ ...p!, api_token: randomToken() }))}>Regen</Button>
              </div>
              <p className="text-xs text-muted-foreground">এই token partner OMS-এর Destination-এ বসাতে হবে।</p>
            </div>
            <div className="space-y-1.5"><Label>Default Courier (এই পার্টনারের অর্ডার এই কুরিয়ারে যাবে)</Label>
              <Select
                value={editing?.default_courier_id ?? "none"}
                onValueChange={(v) => setEditing((p) => ({ ...p!, default_courier_id: v === "none" ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="No default" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No default</SelectItem>
                  {(couriersQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <div><Label>Active</Label></div>
              <Switch checked={editing?.active !== false} onCheckedChange={(v) => setEditing((p) => ({ ...p!, active: v }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SenderProductsDialog
        sender={productsForSender}
        onClose={() => setProductsForSender(null)}
      />
    </Card>

  );
}

// ===== Sender Products Dialog =====

function SenderProductsDialog({
  sender,
  onClose,
}: {
  sender: OmsInboundSetting | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const allFn = useServerFn(listAllProductsForPicker);
  const allowedFn = useServerFn(listAllowedProductsForSender);
  const saveFn = useServerFn(setAllowedProductsForSender);

  const allQ = useQuery({
    queryKey: ["oms-products-all"],
    queryFn: () => allFn(),
    enabled: !!sender,
  });
  const allowedQ = useQuery({
    queryKey: ["oms-products-allowed", sender?.id],
    queryFn: () => allowedFn({ data: { sender_id: sender!.id } }),
    enabled: !!sender,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Initialize selection when allowed list loads / sender changes
  useEffect(() => {
    if (sender && allowedQ.data) {
      setSelected(new Set((allowedQ.data as OmsAllowedProduct[]).map((p) => p.id)));
    }
    if (!sender) {
      setSelected(new Set());
      setSearch("");
    }
  }, [sender, allowedQ.data]);

  const products = (allQ.data ?? []) as OmsAllowedProduct[];
  const filtered = search
    ? products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : products;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (filtered.every((p) => selected.has(p.id))) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.add(p.id));
        return next;
      });
    }
  };

  const handleClose = () => {
    setSelected(new Set());
    setSearch("");
    onClose();
  };

  const save = async () => {
    if (!sender) return;
    setSaving(true);
    try {
      await saveFn({ data: { sender_id: sender.id, product_ids: [...selected] } });
      toast.success("Allowed products updated");
      qc.invalidateQueries({ queryKey: ["oms-products-allowed", sender.id] });
      handleClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!sender} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Allowed Products — {sender?.sender_name}</DialogTitle>
          <CardDescription>এই পার্টনার শুধু এই প্রোডাক্টগুলো sync করতে পারবে।</CardDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search by name or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
              {filtered.every((p) => selected.has(p.id)) && filtered.length > 0 ? "Unselect all" : "Select all"}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            {selected.size} selected / {products.length} total
          </div>
          <div className="border rounded-md max-h-[420px] overflow-auto">
            {allQ.isLoading ? (
              <div className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No products</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => toggle(p.id)}>
                      <TableCell><Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} /></TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="font-mono text-xs">{p.sku ?? "—"}</TableCell>
                      <TableCell className="text-right">{Number(p.price).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



// ===== Logs =====

function LogsCard() {
  const listFn = useServerFn(listOmsForwardLogs);
  const q = useQuery({ queryKey: ["oms-forward-logs"], queryFn: () => listFn(), refetchInterval: 15000 });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Network className="h-4 w-4" />Forward Logs</CardTitle>
        <CardDescription>সর্বশেষ ২০০টি inbound + outbound লগ</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Time</TableHead><TableHead>Dir</TableHead><TableHead>Partner</TableHead>
            <TableHead>Order</TableHead><TableHead>Status</TableHead><TableHead>Detail</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
            ) : (q.data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No logs.</TableCell></TableRow>
            ) : (q.data ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</TableCell>
                <TableCell><Badge variant={l.direction === "inbound" ? "secondary" : "outline"}>{l.direction}</Badge></TableCell>
                <TableCell>{l.destination_name ?? "—"}</TableCell>
                <TableCell className="text-xs">{l.remote_order_no ? `#${l.remote_order_no}` : "—"}</TableCell>
                <TableCell>{l.status === "success" ? <Badge>OK</Badge> : <Badge variant="destructive">Fail</Badge>} {l.http_status ? <span className="text-xs text-muted-foreground ml-1">{l.http_status}</span> : null}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">{l.error_message ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
