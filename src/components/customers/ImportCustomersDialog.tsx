import { useEffect, useRef, useState } from "react";
import { parseSpreadsheet } from "@/lib/spreadsheet-parse";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { importCustomers } from "@/lib/customers-io.functions";

type ParsedRow = { name: string | null; phone: string; address: string | null };

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "customer", "customer_name", "customername", "fullname", "full_name", "নাম"],
  phone: ["phone", "phoneno", "phone_no", "phone no", "mobile", "mobileno", "mobile_no", "contact", "contactno", "phone_number", "ফোন"],
  address: ["address", "location", "ঠিকানা"],
};

function normalize(s: string) {
  return s.toLowerCase().replace(/[\s_\-#]+/g, "").trim();
}

function findHeader(headers: string[], key: keyof typeof HEADER_ALIASES) {
  const aliases = HEADER_ALIASES[key].map(normalize);
  return headers.find((h) => aliases.includes(normalize(h))) ?? null;
}

export function ImportCustomersDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const importFn = useServerFn(importCustomers);
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressDone, setProgressDone] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [liveInserted, setLiveInserted] = useState(0);
  const [liveSkipped, setLiveSkipped] = useState(0);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setRows([]);
    setResult(null);
    setProgress(0);
    setProgressDone(0);
    setProgressTotal(0);
    setLiveInserted(0);
    setLiveSkipped(0);
  }, [open]);

  const handleFile = async (file: File) => {
    try {
      const { headers, rows: rawRows } = await parseSpreadsheet(file);
      const h = {
        name: findHeader(headers, "name"),
        phone: findHeader(headers, "phone"),
        address: findHeader(headers, "address"),
      };
      const parsed: ParsedRow[] = rawRows.map((r) => {
        const name = (h.name ? (r[h.name] ?? "").trim() : "") || null;
        const phone = (h.phone ? (r[h.phone] ?? "").trim() : "") || "N/A";
        const address = (h.address ? (r[h.address] ?? "").trim() : "") || null;
        return { name, phone, address };
      });
      if (parsed.length === 0) {
        toast.error("ফাইলে কোনো রো নেই");
        return;
      }
      setRows(parsed);
      setStep(2);
    } catch (err) {
      toast.error(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const downloadSample = () => {
    const csv = "Name,Phone,Address\nRahim Mia,01712345678,Dhanmondi Dhaka\nKarim,01898765432,Mirpur\n,01911111111,\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    setBusy(true);
    setStep(3);
    setProgress(0);
    setProgressDone(0);
    setProgressTotal(rows.length);
    setLiveInserted(0);
    setLiveSkipped(0);
    try {
      const BATCH = 500;
      let inserted = 0;
      let skipped = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH);
        const res = await importFn({ data: { rows: slice } });
        inserted += res.inserted;
        skipped += res.skipped;
        const done = i + slice.length;
        setProgressDone(done);
        setLiveInserted(inserted);
        setLiveSkipped(skipped);
        setProgress(Math.round((done / rows.length) * 100));
      }
      setResult({ inserted, skipped });
      if (inserted > 0) toast.success(`Imported ${inserted} customers`);
      if (skipped > 0) toast.message(`${skipped} skipped (duplicate/existing)`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Customers — Step {step} of 3</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <Alert>
              <AlertDescription className="text-sm">
                সব হেডার optional: <b>Name, Phone, Address</b>। কলাম যে কোনো ক্রমে থাকতে পারে — হেডার নাম দেখে অটো ম্যাচ হবে। ডাটা না থাকলে ডিফল্ট বসবে (Phone=N/A)। একই phone আগে থেকে থাকলে skip হবে।
                <div className="mt-2 text-xs text-muted-foreground">
                  CSV ও XLSX দুটোই গ্রহণ — একসাথে ২০০০ পর্যন্ত কাস্টমার, ৫০০ করে ব্যাচে প্রসেস, লাইভ প্রগ্রেস দেখা যাবে।
                </div>
              </AlertDescription>
            </Alert>
            <Button variant="outline" size="sm" onClick={downloadSample}>
              <Download className="h-4 w-4" /> Download sample CSV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) handleFile(f);
              }}
            />
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Choose file
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="text-sm">
              <b>{rows.length}</b> rows পার্স হয়েছে। ইম্পোর্ট শুরু করতে নিচের বাটনে ক্লিক করুন।
            </div>
            <div className="max-h-64 overflow-auto rounded border text-xs">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Phone</th>
                    <th className="p-2 text-left">Address</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.name ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-2">{r.phone}</td>
                      <td className="p-2">{r.address ?? <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 50 && (
              <div className="text-xs text-muted-foreground">প্রথম 50 দেখানো হয়েছে।</div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <Progress value={progress} />
            <div className="text-sm">
              {busy ? "Importing..." : "Done"} {progressDone}/{progressTotal} ({progress}%)
            </div>
            <div className="flex gap-4 text-sm">
              <div className="text-green-600">Inserted: {liveInserted}</div>
              <div className="text-muted-foreground">Skipped: {liveSkipped}</div>
            </div>
            {result && !busy && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  সম্পন্ন — {result.inserted} টি কাস্টমার যোগ হয়েছে, {result.skipped} টি skip হয়েছে।
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={handleImport}>
                <Upload className="h-4 w-4" /> Start import ({rows.length})
              </Button>
            </>
          )}
          {step === 3 && (
            <Button onClick={() => onOpenChange(false)} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
