import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  listReviewsByPhone, createReview, deleteReview, type ReviewRow,
} from "@/lib/reviews.functions";

function Stars({ value, onChange, size = 18 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  const readonly = !onChange;
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            disabled={readonly}
            onClick={() => onChange?.(n)}
            className={`p-0.5 ${readonly ? "cursor-default" : "hover:scale-110"} transition-transform`}
            aria-label={`${n} star`}
          >
            <Star
              style={{ width: size, height: size }}
              className={filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}
            />
          </button>
        );
      })}
    </div>
  );
}

export function ReviewDialog({
  open, onOpenChange, phone, customerName, orderId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  phone: string;
  customerName?: string | null;
  orderId?: string | null;
}) {
  const fetchList = useServerFn(listReviewsByPhone);
  const createFn = useServerFn(createReview);
  const deleteFn = useServerFn(deleteReview);

  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [setupMissing, setSetupMissing] = useState(false);

  const isSetupMessage = (message: string) =>
    message.includes("রিভিউ টেবিল")
    || (message.includes("customer_reviews") && message.toLowerCase().includes("schema cache"));

  const load = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      setRows(await fetchList({ data: { phone: phone.trim() } }));
      setSetupMissing(false);
    } catch (e: any) {
      const message = e?.message ?? "রিভিউ লোড করা যায়নি";
      if (isSetupMessage(message)) {
        setRows([]);
        setSetupMissing(true);
      } else {
        toast.error(message);
      }
    }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) load(); }, [open, phone]);

  const submit = async () => {
    setSaving(true);
    try {
      await createFn({ data: {
        phone: phone.trim(),
        customer_name: customerName || null,
        order_id: orderId || null,
        rating, note: note.trim() || null,
      }});
      toast.success("রিভিউ সংরক্ষণ হয়েছে");
      setNote(""); setRating(5); setShowForm(false);
      await load();
    } catch (e: any) {
      const message = e.message ?? "ব্যর্থ";
      if (isSetupMessage(message)) setSetupMissing(true);
      toast.error(message);
    }
    finally { setSaving(false); }
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
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            রিভিউ — {customerName || phone}
          </DialogTitle>
          <DialogDescription>{phone}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {loading ? "লোড হচ্ছে…" : `${rows.length}টি রিভিউ`}
            </p>
            {!showForm && (
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" /> নতুন রিভিউ
              </Button>
            )}
          </div>

          {setupMissing && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              রিভিউ টেবিল এখনো অডিট প্রজেক্টে নেই। customer_reviews.sql চালালে এখান থেকেই রিভিউ সেভ হবে।
            </div>
          )}

          {showForm && (
            <div className="rounded-md border p-3 space-y-3 bg-muted/30">
              <div>
                <Label className="text-xs">Rating</Label>
                <div className="mt-1"><Stars value={rating} onChange={setRating} size={24} /></div>
              </div>
              <div>
                <Label className="text-xs">Note (optional)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                  placeholder="যেমন: ভালো সার্ভিস, দ্রুত ডেলিভারি…" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button size="sm" onClick={submit} disabled={saving}>
                  {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Save
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {rows.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground text-center py-6">কোনো রিভিউ নেই।</p>
            )}
            {rows.map((r) => (
              <div key={r.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start gap-2 flex-wrap">
                  <Stars value={r.rating} />
                  {r.order_number && (
                    <span className="text-[10px] text-muted-foreground">#{r.order_number}</span>
                  )}
                  <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => remove(r.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                {r.note && <p className="text-sm whitespace-pre-wrap">{r.note}</p>}
                <div className="text-[10px] text-muted-foreground">
                  {r.created_by_name ?? "—"} • {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}