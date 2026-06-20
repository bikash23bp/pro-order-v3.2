import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, MessageSquareWarning, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listComplaintsByPhone, createComplaint, updateComplaint, deleteComplaint,
  COMPLAINT_CATEGORIES, COMPLAINT_SEVERITIES, COMPLAINT_STATUSES,
  CATEGORY_LABEL, SEVERITY_LABEL, STATUS_LABEL, SEVERITY_TONE, STATUS_TONE,
  type ComplaintRow, type ComplaintCategory, type ComplaintSeverity, type ComplaintStatus,
} from "@/lib/complaints.functions";

export function ComplaintDialog({
  open, onOpenChange, phone, customerName, orderId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  phone: string;
  customerName?: string | null;
  orderId?: string | null;
}) {
  const fetchList = useServerFn(listComplaintsByPhone);
  const createFn = useServerFn(createComplaint);
  const updateFn = useServerFn(updateComplaint);
  const deleteFn = useServerFn(deleteComplaint);

  const [rows, setRows] = useState<ComplaintRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [category, setCategory] = useState<ComplaintCategory>("damage");
  const [severity, setSeverity] = useState<ComplaintSeverity>("medium");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      const r = await fetchList({ data: { phone: phone.trim() } });
      setRows(r);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) load(); }, [open, phone]);

  const submit = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await createFn({ data: {
        phone: phone.trim(),
        customer_name: customerName || null,
        order_id: orderId || null,
        category, severity, note: note.trim(),
      }});
      toast.success("অভিযোগ সংরক্ষণ হয়েছে");
      setNote(""); setShowForm(false);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "ব্যর্থ");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: string, status: ComplaintStatus, resolution_note?: string | null) => {
    try {
      await updateFn({ data: { id, status, resolution_note: resolution_note ?? null } });
      toast.success("আপডেট হয়েছে");
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm("ডিলিট করবেন?")) return;
    try { await deleteFn({ data: { id } }); await load(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareWarning className="h-5 w-5 text-rose-400" />
            অভিযোগ — {customerName || phone}
          </DialogTitle>
          <DialogDescription>{phone}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {loading ? "লোড হচ্ছে…" : `${rows.length}টি অভিযোগ`}
            </p>
            {!showForm && (
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" /> নতুন অভিযোগ
              </Button>
            )}
          </div>

          {showForm && (
            <div className="rounded-md border p-3 space-y-2 bg-muted/30">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as ComplaintCategory)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMPLAINT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Severity</Label>
                  <Select value={severity} onValueChange={(v) => setSeverity(v as ComplaintSeverity)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMPLAINT_SEVERITIES.map((s) => (
                        <SelectItem key={s} value={s}>{SEVERITY_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Note</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                  placeholder="যেমন: ড্যামেজ পেয়েছি, রিফান্ড হয়নি…" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button size="sm" onClick={submit} disabled={saving || !note.trim()}>
                  {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Save
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {rows.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground text-center py-6">কোনো অভিযোগ নেই।</p>
            )}
            {rows.map((c) => (
              <div key={c.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${STATUS_TONE[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${SEVERITY_TONE[c.severity]}`}>
                    {SEVERITY_LABEL[c.severity]}
                  </span>
                  <span className="px-1.5 py-0.5 rounded border text-[10px] font-medium bg-muted">
                    {CATEGORY_LABEL[c.category]}
                  </span>
                  {c.order_number && (
                    <span className="text-[10px] text-muted-foreground">#{c.order_number}</span>
                  )}
                  <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => remove(c.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.note}</p>
                {c.resolution_note && (
                  <p className="text-xs text-muted-foreground border-l-2 border-emerald-500/50 pl-2">
                    <span className="font-medium text-emerald-400">Resolution:</span> {c.resolution_note}
                  </p>
                )}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    {c.created_by_name ?? "—"} • {new Date(c.created_at).toLocaleString()}
                  </span>
                  <div className="flex gap-1">
                    {c.status !== "in_progress" && c.status !== "resolved" && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px]"
                        onClick={() => setStatus(c.id, "in_progress")}>চলমান</Button>
                    )}
                    {c.status !== "resolved" && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px]"
                        onClick={() => {
                          const r = prompt("Resolution note (optional):") ?? "";
                          setStatus(c.id, "resolved", r || null);
                        }}>Resolve</Button>
                    )}
                    {c.status !== "open" && (
                      <Button size="sm" variant="ghost" className="h-6 text-[10px]"
                        onClick={() => setStatus(c.id, "open")}>Re-open</Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
