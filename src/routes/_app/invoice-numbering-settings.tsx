import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Hash, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_app/invoice-numbering-settings")({
  head: () => ({ meta: [{ title: "Invoice Numbering — OMS" }] }),
  component: InvoiceNumberingPage,
});

function buildPreview(prefix: string, suffix: string, includeYear: boolean, pad: number, year: number, seq: number) {
  const padded = String(Math.max(seq, 1)).padStart(Math.max(pad, 1), "0");
  const ys = includeYear ? `${year}-` : "";
  return `${prefix}${ys}${padded}${suffix}`;
}

function InvoiceNumberingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefix, setPrefix] = useState("INV-");
  const [suffix, setSuffix] = useState("");
  const [includeYear, setIncludeYear] = useState(true);
  const [padLength, setPadLength] = useState(5);
  const [nextSeq, setNextSeq] = useState(1);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("app_settings").select("invoice_prefix, invoice_suffix, invoice_include_year, invoice_pad_length, invoice_seq, invoice_year").eq("id", true).maybeSingle();
      if (error) toast.error(error.message);
      const d = data as any;
      if (d) {
        setPrefix(d.invoice_prefix ?? "INV-");
        setSuffix(d.invoice_suffix ?? "");
        setIncludeYear(d.invoice_include_year ?? true);
        setPadLength(d.invoice_pad_length ?? 5);
        setNextSeq((d.invoice_seq ?? 0) + 1);
        setYear(d.invoice_year ?? new Date().getFullYear());
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const payload = {
      invoice_prefix: prefix,
      invoice_suffix: suffix,
      invoice_include_year: includeYear,
      invoice_pad_length: Math.max(1, Math.min(12, padLength)),
      invoice_seq: Math.max(0, nextSeq - 1),
      invoice_year: year,
    };
    const { error } = await supabase.from("app_settings").update(payload as any).eq("id", true);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Invoice numbering settings saved");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const preview = buildPreview(prefix, suffix, includeYear, padLength, year, nextSeq);

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Hash className="h-6 w-6" /> Invoice Numbering
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure how invoice numbers are auto-generated for every new order.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Format</CardTitle>
          <CardDescription>Customize prefix, suffix, and padding. Changes apply to new orders only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Prefix</Label>
              <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="INV-" />
            </div>
            <div className="space-y-2">
              <Label>Suffix</Label>
              <Input value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="(optional)" />
            </div>
            <div className="space-y-2">
              <Label>Pad Length</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={padLength}
                onChange={(e) => setPadLength(Number(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">Number of digits in the sequence (e.g. 5 → 00042).</p>
            </div>
            <div className="space-y-2">
              <Label>Next Sequence</Label>
              <Input
                type="number"
                min={1}
                value={nextSeq}
                onChange={(e) => setNextSeq(Number(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">The next order will use this sequence number.</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm">Include Year</Label>
              <p className="text-xs text-muted-foreground">Insert the current year between prefix and sequence.</p>
            </div>
            <Switch checked={includeYear} onCheckedChange={setIncludeYear} />
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">Preview (next invoice)</div>
            <div className="font-mono text-lg">{preview}</div>
            <div className="text-xs text-muted-foreground mt-1">Current year on record: {year}</div>
          </div>

          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
