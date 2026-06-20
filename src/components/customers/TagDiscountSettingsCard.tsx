import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Percent, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CUSTOMER_TAGS, TAG_LABEL, TAG_TONE, type CustomerTag } from "@/lib/tags.functions";
import {
  useTagDiscountSettings,
  invalidateTagDiscounts,
  type TagDiscountMap,
} from "@/hooks/use-tag-discounts";

/** Inline admin editor: per-tag discount % + enable switch. */
export function TagDiscountSettingsCard() {
  const initial = useTagDiscountSettings();
  const [draft, setDraft] = useState<TagDiscountMap>(initial);
  const [saving, setSaving] = useState<CustomerTag | null>(null);

  // Keep draft synced when cache fills in
  useEffect(() => { setDraft(initial); }, [initial]);

  const update = (tag: CustomerTag, patch: Partial<{ rate: number; enabled: boolean }>) =>
    setDraft((d) => ({ ...d, [tag]: { ...d[tag], ...patch } }));

  const save = async (tag: CustomerTag) => {
    const row = draft[tag];
    if (row.rate < 0 || row.rate > 100) {
      toast.error("Discount must be between 0 and 100");
      return;
    }
    setSaving(tag);
    try {
      const { error } = await supabase
        .from("customer_tag_discounts" as never)
        .upsert(
          { tag, rate: row.rate, enabled: row.enabled } as never,
          { onConflict: "tag" },
        );
      if (error) throw new Error(error.message);
      toast.success(`${TAG_LABEL[tag]} discount saved`);
      invalidateTagDiscounts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed (admin only)");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Percent className="h-4 w-4 text-primary" />
          Tag Discounts
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          প্রতিটি ট্যাগের জন্য ডিসকাউন্ট রেট সেট করুন। অর্ডারে কাস্টমারের ট্যাগ অনুযায়ী automatic discount apply হবে (একাধিক ট্যাগ থাকলে সর্বোচ্চ রেট)।
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CUSTOMER_TAGS.map((t) => {
            const row = draft[t];
            return (
              <div key={t} className="flex items-center gap-2 rounded-md border bg-card/50 p-2">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TAG_TONE[t]}`}>
                  {TAG_LABEL[t]}
                </span>
                <div className="flex items-center gap-1 ml-auto">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={Number.isFinite(row.rate) ? row.rate : 0}
                    onChange={(e) => update(t, { rate: Number(e.target.value) })}
                    className="h-8 w-20 text-right"
                  />
                  <Label className="text-xs text-muted-foreground">%</Label>
                </div>
                <Switch
                  checked={row.enabled}
                  onCheckedChange={(v) => update(t, { enabled: !!v })}
                  aria-label={`${TAG_LABEL[t]} enabled`}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => save(t)}
                  disabled={saving === t}
                  aria-label="Save"
                >
                  {saving === t ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
