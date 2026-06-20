import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Pencil, Save, X, Phone, Mail, MapPin, Package, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCustomerProfile, updateCustomerByPhone, type CustomerProfile } from "@/lib/customer-profile.functions";
import { CustomerTagPicker } from "@/components/customers/CustomerTagPicker";
import { BlockCustomerDialog } from "@/components/customers/BlockCustomerDialog";

export function CustomerProfileDialog({
  phone,
  open,
  onClose,
  onUpdated,
  blockedInfo,
}: {
  phone: string;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  blockedInfo?: { reason: string; blocked_by_name?: string | null; blocked_at?: string | null } | null;
}) {
  const fetchProfile = useServerFn(getCustomerProfile);
  const updateFn = useServerFn(updateCustomerByPhone);
  const [data, setData] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", address: "", newPhone: "" });
  const [blockOpen, setBlockOpen] = useState(false);

  useEffect(() => {
    if (!open || !phone) return;
    (async () => {
      setLoading(true);
      try {
        const p = await fetchProfile({ data: { phone } });
        setData(p);
        if (p) setForm({ name: p.name ?? "", email: p.email ?? "", address: p.address ?? "", newPhone: p.phone });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      } finally { setLoading(false); }
    })();
  }, [open, phone]);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const r = await updateFn({ data: {
        phone: data.phone,
        name: form.name,
        email: form.email || null,
        address: form.address,
        newPhone: form.newPhone && form.newPhone !== data.phone ? form.newPhone : undefined,
      }});
      toast.success(`Updated ${r.updated} order(s)`);
      setEditing(false);
      onUpdated?.();
      // refresh
      const p = await fetchProfile({ data: { phone: form.newPhone || data.phone } });
      setData(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>Customer Profile</span>
            <div className="flex items-center gap-2">
              {data && <CustomerTagPicker phone={data.phone} buttonLabel="Tags" />}
              {data && (
                <Button size="sm" variant="outline" onClick={() => setBlockOpen(true)} className="text-red-600 hover:text-red-700">
                  <ShieldAlert className="h-4 w-4" /> Block
                </Button>
              )}
              {data && !editing && (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No data for this customer.</p>
        ) : (
          <div className="space-y-4">
            {blockedInfo && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-red-600">
                  <ShieldAlert className="h-4 w-4" /> Blocked customer
                </div>
                <div className="mt-1 text-red-700/90 dark:text-red-300/90">
                  <span className="font-semibold">Reason:</span> {blockedInfo.reason}
                </div>
                {(blockedInfo.blocked_by_name || blockedInfo.blocked_at) && (
                  <div className="text-xs text-red-700/70 dark:text-red-300/70 mt-0.5">
                    {blockedInfo.blocked_by_name ? `By ${blockedInfo.blocked_by_name}` : ""}
                    {blockedInfo.blocked_at ? ` · ${new Date(blockedInfo.blocked_at).toLocaleString()}` : ""}
                  </div>
                )}
              </div>
            )}
            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} /></div>
                <div className="space-y-1.5"><Label>Phone</Label><Input value={form.newPhone} onChange={(e) => setForm({...form, newPhone: e.target.value})} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label>Address</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({...form, address: e.target.value})} /></div>
                <div className="sm:col-span-2 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}><X className="h-4 w-4" /> Cancel</Button>
                  <Button onClick={save} disabled={saving || !form.name.trim() || !form.address.trim()}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                  </Button>
                </div>
              </div>
            ) : (
              <Card>
                <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-muted-foreground">Name</div><div className="font-medium">{data.name ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />Phone</div><div className="font-medium">{data.phone}</div></div>
                  <div><div className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />Email</div><div className="font-medium">{data.email ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />Address</div><div className="font-medium">{data.address ?? "—"}</div></div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Stat label="Orders" value={data.totalOrders} />
              <Stat label="Completed" value={data.successful} tone="green" />
              <Stat label="Running" value={data.running} tone="amber" />
              <Stat label="Cancelled" value={data.cancelled} tone="red" />
              <Stat label="Returned" value={data.returns} tone="red" />
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Lifetime value:</span>{" "}
              <span className="font-semibold">৳ {data.totalSpent.toFixed(2)}</span>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium flex items-center gap-1"><Package className="h-4 w-4" /> Purchase History</div>
              {data.orders.length === 0 ? (
                <p className="text-xs text-muted-foreground">No orders.</p>
              ) : (
                <div className="space-y-2">
                  {data.orders.map((o) => (
                    <div key={o.id} className="rounded-md border p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-mono">#{o.order_number}</span>
                        <Badge variant="outline" className="text-[10px]">{o.status.replace(/_/g, " ")}</Badge>
                        <span className="text-muted-foreground text-xs">{new Date(o.created_at).toLocaleDateString()}</span>
                        <span className="font-semibold">৳ {o.total_amount.toFixed(2)}</span>
                      </div>
                      {o.items.length > 0 && (
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {o.items.map((it, i) => (
                            <div key={i} className="flex justify-between">
                              <span>{it.name} × {it.quantity}</span>
                              <span>৳ {(it.unit_price * it.quantity).toFixed(0)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
      {data && (
        <BlockCustomerDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          defaultPhone={data.phone}
          allowEdit={false}
          onBlocked={() => setBlockOpen(false)}
        />
      )}
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" | "red" }) {
  const c = tone === "green" ? "text-emerald-500" : tone === "amber" ? "text-amber-500" : tone === "red" ? "text-destructive" : "";
  return (
    <div className="rounded-md border p-2 text-center">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${c}`}>{value}</div>
    </div>
  );
}
