import { useEffect, useMemo, useRef, useState } from "react";
import { parseSpreadsheet } from "@/lib/spreadsheet-parse";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { listProductsForImport, importLegacyOrders, createImportProducts, findExistingPhoneDatePairs } from "@/lib/orders-import.functions";

type Product = { id: string; name: string; sku: string | null; price: number };



type ParsedRow = {
  rowIndex: number; // 1-based for user
  order_date: string; // ISO
  name: string;
  phone: string;
  address: string;
  email: string | null;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  delivery_charge: number;
  total: number;
  tracking_id: string;
  invoice_number: string;
  note: string;
  status: string;
  group_key: string;
  errors: string[];
  raw: Record<string, string>; // full raw row for custom-field extraction
};

type ColumnRole = "standard" | "custom" | "skip";

const HEADER_ALIASES: Record<string, string[]> = {
  order_date: ["order_date", "date", "order date", "orderdate", "tarikh", "তারিখ"],
  name: ["name", "customer", "customer_name", "customername", "নাম"],
  phone: ["phone", "phoneno", "phone_no", "phone no", "mobile", "mobileno", "mobile_no", "contact", "contactno", "ফোন"],
  address: ["address", "ঠিকানা"],
  email: ["email", "e-mail", "ইমেইল"],
  product_name: ["product_name", "productname", "product name", "product", "item", "itemname", "প্রোডাক্ট"],
  sku: ["sku", "product_sku", "productsku", "code", "productcode", "item_code", "itemcode"],
  quantity: ["quantity", "qty", "qnty", "পরিমাণ"],
  price: ["price", "unit_price", "unitprice", "rate", "প্রাইস"],
  delivery_charge: ["delivery_charge", "deliverycharge", "delivery charge", "delivery", "shipping", "shippingcharge", "courier", "couriercharge", "ডেলিভারি"],
  total: ["total", "totalprice", "total_price", "amount", "grandtotal", "grand_total", "মোট", "cod", "cod amount", "codamount", "cod_amount"],
  tracking_id: ["tracking_id", "trackingid", "tracking", "tracking no", "trackingno", "consignment", "consignment_id", "consignmentid", "awb", "steadfast tracking code", "steadfasttrackingcode", "tracking code", "trackingcode"],
  invoice_number: ["invoice_number", "invoicenumber", "invoiceno", "invoice_no", "invoice no", "invoice", "invoice#"],
  note: ["note", "notes", "remark", "remarks", "comment", "comments", "invoice_note", "invoicenote"],
  status: ["status", "order_status", "orderstatus", "state", "স্ট্যাটাস", "স্টাটাস", "delivery status", "deliverystatus", "delivery_status"],
  group: ["order_ref", "order_id", "orderid", "ref", "group", "groupkey", "order id"],
};

const DEFAULT_PRODUCT_NAME = "Old Product Agarbatti";

function normalize(s: string) {
  return s.toLowerCase().replace(/[\s_\-#]+/g, "").trim();
}

function findHeader(headers: string[], key: keyof typeof HEADER_ALIASES) {
  const aliases = HEADER_ALIASES[key].map(normalize);
  return headers.find((h) => aliases.includes(normalize(h))) ?? null;
}

// Bangladesh local midnight as ISO (UTC). E.g. "2024-12-31" Asia/Dhaka = 2024-12-30T18:00:00Z
function bdMidnightIso(year: number, monthIdx: number, day: number): string {
  return new Date(Date.UTC(year, monthIdx, day, -6, 0, 0)).toISOString();
}

function parseDate(s: string): string | null {
  if (!s || !s.trim()) return new Date().toISOString();
  const t = s.trim();

  // Excel serial date (pure number, e.g. "45000")
  if (/^\d{1,6}(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (n > 59 && n < 80000) {
      const ms = Math.round((n - 25569) * 86400 * 1000);
      const d = new Date(ms);
      const y = d.getUTCFullYear();
      if (!isNaN(d.getTime()) && y >= 1900 && y <= 2100) return d.toISOString();
    }
    // any other bare number → not a real date, use today
    return new Date().toISOString();
  }

  // YYYY-MM-DD or ISO
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const y = +iso[1], mo = +iso[2] - 1, dd = +iso[3];
    if (y >= 1900 && y <= 2100 && mo >= 0 && mo <= 11 && dd >= 1 && dd <= 31) {
      return bdMidnightIso(y, mo, dd);
    }
    return new Date().toISOString();
  }
  // DD/MM/YYYY or DD-MM-YYYY (Bangladesh convention)
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const dd = +m[1], mo = +m[2] - 1;
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (year >= 1900 && year <= 2100 && mo >= 0 && mo <= 11 && dd >= 1 && dd <= 31) {
      return bdMidnightIso(year, mo, dd);
    }
    return new Date().toISOString();
  }

  const d = new Date(t);
  const y = d.getUTCFullYear();
  if (!isNaN(d.getTime()) && y >= 1900 && y <= 2100) return d.toISOString();
  return new Date().toISOString();
}

const VALID_STATUSES = new Set([
  "pending_web", "processing", "ready_to_ship", "out_of_stock", "shipped",
  "completed", "cancelled", "returned", "no_response", "fraud",
]);
const STATUS_ALIASES: Record<string, string> = {
  pending: "pending_web", "pending_web": "pending_web", "pending web": "pending_web",
  processing: "processing", inprocess: "processing", "in process": "processing", "in progress": "processing",
  ready: "ready_to_ship", "ready to ship": "ready_to_ship", "ready_to_ship": "ready_to_ship", readytoship: "ready_to_ship",
  "out of stock": "out_of_stock", out_of_stock: "out_of_stock", outofstock: "out_of_stock", oos: "out_of_stock",
  shipped: "shipped", dispatched: "shipped", sent: "shipped",
  completed: "completed", complete: "completed", delivered: "completed", done: "completed", success: "completed",
  cancelled: "returned", canceled: "returned", cancel: "returned",
  returned: "returned", return: "returned",
  "no response": "no_response", noresponse: "no_response", no_response: "no_response", "no_resp": "no_response",
  fraud: "fraud", fake: "fraud",
};
function normalizeStatus(raw: string, fallback: string): string {
  if (!raw) return fallback;
  const k = raw.toLowerCase().trim().replace(/[\s_\-]+/g, " ").trim();
  if (VALID_STATUSES.has(k.replace(/ /g, "_"))) return k.replace(/ /g, "_");
  const alias = STATUS_ALIASES[k] ?? STATUS_ALIASES[k.replace(/ /g, "")] ?? STATUS_ALIASES[k.replace(/ /g, "_")];
  if (alias && VALID_STATUSES.has(alias)) return alias;
  return fallback;
}

function autoMatch(csvName: string, csvSku: string, products: Product[]): string | null {
  const sku = normalize(csvSku);
  if (sku) {
    const bySku = products.find((p) => p.sku && normalize(p.sku) === sku);
    if (bySku) return bySku.id;
  }
  const target = normalize(csvName);
  if (!target) return null;
  const exact = products.find((p) => normalize(p.name) === target);
  if (exact) return exact.id;
  const bySkuName = products.find((p) => p.sku && normalize(p.sku) === target);
  if (bySkuName) return bySkuName.id;
  const sub = products.find((p) => normalize(p.name).includes(target) || target.includes(normalize(p.name)));
  return sub?.id ?? null;
}

export function ImportOrdersDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const fetchProducts = useServerFn(listProductsForImport);
  const importFn = useServerFn(importLegacyOrders);
  const createProductsFn = useServerFn(createImportProducts);
  const findExistingFn = useServerFn(findExistingPhoneDatePairs);
  const fileRef = useRef<HTMLInputElement>(null);
  const [autoCreate, setAutoCreate] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const [products, setProducts] = useState<Product[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [productMap, setProductMap] = useState<Map<string, string>>(new Map()); // csvName -> productId
  const [allHeaders, setAllHeaders] = useState<string[]>([]);
  const [columnRoles, setColumnRoles] = useState<Record<string, ColumnRole>>({});
  const [status, setStatus] = useState<string>("completed");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressDone, setProgressDone] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [liveInserted, setLiveInserted] = useState(0);
  const [liveFailed, setLiveFailed] = useState(0);
  const [result, setResult] = useState<{ inserted: number; failed: number; errors: { index: number; message: string }[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setRows([]);
    setProductMap(new Map());
    setAllHeaders([]);
    setColumnRoles({});
    setResult(null);
    setProgress(0);
    fetchProducts().then(setProducts).catch((e) => toast.error(e.message));
  }, [open]);

  const uniqueProducts = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.product_name && set.add(r.product_name));
    return Array.from(set);
  }, [rows]);

  const allMapped = autoCreate || uniqueProducts.every((n) => productMap.get(n));

  const customColumns = useMemo(
    () => allHeaders.filter((h) => columnRoles[h] === "custom"),
    [allHeaders, columnRoles],
  );

  const handleFile = async (file: File) => {
    try {
      const { headers, rows: rawRows } = await parseSpreadsheet(file);
      const h = {
        order_date: findHeader(headers, "order_date"),
        name: findHeader(headers, "name"),
        phone: findHeader(headers, "phone"),
        address: findHeader(headers, "address"),
        email: findHeader(headers, "email"),
        product_name: findHeader(headers, "product_name"),
        sku: findHeader(headers, "sku"),
        quantity: findHeader(headers, "quantity"),
        price: findHeader(headers, "price"),
        delivery_charge: findHeader(headers, "delivery_charge"),
        total: findHeader(headers, "total"),
        tracking_id: findHeader(headers, "tracking_id"),
        invoice_number: findHeader(headers, "invoice_number"),
        note: findHeader(headers, "note"),
        status: findHeader(headers, "status"),
        group: findHeader(headers, "group"),
      };
      // সব ফিল্ড optional — কোনো হেডার না থাকলেও ইম্পোর্ট চলবে, খালি ভ্যালুতে ডিফল্ট বসবে
      const recognized = new Set<string>(
        Object.values(h).filter(Boolean) as string[],
      );
      const initialRoles: Record<string, ColumnRole> = {};
      headers.forEach((header) => {
        initialRoles[header] = recognized.has(header) ? "standard" : "custom";
      });

      const parsed: ParsedRow[] = rawRows.map((r, i) => {
        const dateStr = h.order_date ? r[h.order_date] ?? "" : "";
        const isoDate = parseDate(dateStr) ?? new Date().toISOString();
        const name = (h.name ? (r[h.name] ?? "").trim() : "") || "Unknown";
        const phone = (h.phone ? (r[h.phone] ?? "").trim() : "") || "N/A";
        const address = (h.address ? (r[h.address] ?? "").trim() : "") || "N/A";
        const sku = h.sku ? (r[h.sku] ?? "").trim() : "";
        const productNameRaw = h.product_name ? (r[h.product_name] ?? "").trim() : "";
        const productName = productNameRaw || sku || DEFAULT_PRODUCT_NAME;
        const qty = h.quantity ? parseInt(r[h.quantity] ?? "1", 10) : 1;
        const safeQty = isNaN(qty) || qty < 1 ? 1 : qty;
        const priceRaw = h.price ? parseFloat(r[h.price] ?? "0") : 0;
        const delivery = h.delivery_charge ? parseFloat(r[h.delivery_charge] ?? "0") : 0;
        const safeDelivery = isNaN(delivery) ? 0 : delivery;
        const totalRaw = h.total ? parseFloat(r[h.total] ?? "0") : 0;
        const safeTotal = isNaN(totalRaw) ? 0 : totalRaw;
        let unitPrice = isNaN(priceRaw) ? 0 : priceRaw;
        if (unitPrice <= 0 && safeTotal > 0) {
          unitPrice = Math.max(0, (safeTotal - safeDelivery) / safeQty);
        }
        const groupKey = h.group ? (r[h.group] ?? "").trim() : "";
        return {
          rowIndex: i + 2,
          order_date: isoDate,
          name,
          phone,
          address,
          email: h.email ? ((r[h.email] ?? "").trim() || null) : null,
          product_name: productName,
          sku,
          quantity: safeQty,
          unit_price: unitPrice,
          delivery_charge: safeDelivery,
          total: safeTotal,
          tracking_id: h.tracking_id ? (r[h.tracking_id] ?? "").trim() : "",
          invoice_number: h.invoice_number ? (r[h.invoice_number] ?? "").trim() : "",
          note: h.note ? (r[h.note] ?? "").trim() : "",
          status: h.status ? (r[h.status] ?? "").trim() : "",
          group_key: groupKey || `row-${i}`,
          errors: [],
          raw: r,
        };
      });
      setRows(parsed);
      setAllHeaders(headers);
      setColumnRoles(initialRoles);
      const map = new Map<string, string>();
      const skuByName = new Map<string, string>();
      parsed.forEach((p) => {
        if (p.product_name && p.sku && !skuByName.has(p.product_name)) {
          skuByName.set(p.product_name, p.sku);
        }
      });
      const uniq = Array.from(new Set(parsed.map((p) => p.product_name).filter(Boolean)));
      uniq.forEach((n) => {
        const m = autoMatch(n, skuByName.get(n) ?? "", products);
        if (m) map.set(n, m);
      });
      setProductMap(map);
      setStep(2);
    } catch (err) {
      toast.error(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const downloadSample = () => {
    const csv = "OrderDate,Name,PhoneNo,Address,Email,ProductName,Sku,Price,Quantity,DeliveryCharge,Total,TrackingId,InvoiceNo,Note\n2024-01-15,Rahim Mia,01712345678,Dhanmondi Dhaka,rahim@example.com,T-Shirt Red M,TS-RED-M,500,2,60,1060,STDF12345,INV-001,Gift wrap\n2024-01-16,Karim,01898765432,Mirpur,,Hoodie Black L,HD-BLK-L,1200,1,80,1280,,INV-002,\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "orders-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const grouped = useMemo(() => {
    const m = new Map<string, ParsedRow[]>();
    rows.forEach((r) => {
      if (r.errors.length) return;
      if (!autoCreate && !productMap.get(r.product_name)) return;
      const arr = m.get(r.group_key) ?? [];
      arr.push(r);
      m.set(r.group_key, arr);
    });
    return m;
  }, [rows, productMap, autoCreate]);

  const invalidRows = rows.filter((r) => r.errors.length || (!autoCreate && !productMap.get(r.product_name)));
  const validOrderCount = grouped.size;
  const missingProductCount = uniqueProducts.filter((n) => !productMap.get(n)).length;

  const handleImport = async () => {
    setBusy(true);
    setProgress(0);
    setProgressDone(0);
    setLiveInserted(0);
    setLiveFailed(0);
    try {
      // Step A: auto-create missing products if enabled
      let effectiveMap = productMap;
      if (autoCreate) {
        const missing = uniqueProducts.filter((n) => !effectiveMap.get(n));
        if (missing.length > 0) {
          const priceByName = new Map<string, number>();
          for (const r of rows) {
            if (missing.includes(r.product_name) && !priceByName.has(r.product_name)) {
              priceByName.set(r.product_name, r.unit_price || 0);
            }
          }
          const items = missing.map((n) => ({ name: n, price: priceByName.get(n) ?? 0 }));
          const next = new Map(effectiveMap);
          let createdTotal = 0;
          let errorsTotal = 0;
          const PCHUNK = 500;
          for (let i = 0; i < items.length; i += PCHUNK) {
            const res = await createProductsFn({ data: { items: items.slice(i, i + PCHUNK) } });
            for (const [name, id] of Object.entries(res.map)) next.set(name, id);
            createdTotal += res.created;
            errorsTotal += res.errors.length;
          }
          effectiveMap = next;
          setProductMap(next);
          if (errorsTotal > 0) toast.error(`${errorsTotal} products failed to create`);
          else if (createdTotal > 0) toast.success(`Created ${createdTotal} new products`);
        }
      }

      const orders = Array.from(grouped.entries())
        .map(([_, items]) => {
          const first = items[0];
          const mapped = items
            .map((it) => ({
              product_id: effectiveMap.get(it.product_name),
              quantity: it.quantity,
              unit_price: it.unit_price,
            }))
            .filter((it) => !!it.product_id) as { product_id: string; quantity: number; unit_price: number }[];
          if (mapped.length === 0) return null;
          // collect custom fields from the first row of this order group
          const customFields = customColumns
            .map((col) => ({ key: col, value: (first.raw[col] ?? "").toString() }))
            .filter((f) => f.value !== "");
          return {
            customer_name: first.name,
            customer_phone: first.phone,
            customer_address: first.address,
            customer_email: first.email,
            order_date: first.order_date,
            status: normalizeStatus(first.status, status),
            delivery_charge: first.delivery_charge,
            items: mapped,
            custom_fields: customFields.length > 0 ? customFields : undefined,
            tracking_id: first.tracking_id || undefined,
            invoice_number: first.invoice_number || undefined,
            note: first.note || undefined,
          };
        })
        .filter(Boolean) as any[];

      // Duplicate skip: same phone + same date (within file & against DB)
      let workingOrders = orders;
      let dupSkipped = 0;
      if (skipDuplicates && orders.length > 0) {
        const dayOf = (iso: string) => (iso ?? "").slice(0, 10);
        const seen = new Set<string>();
        const fileDeduped: any[] = [];
        for (const o of orders) {
          const key = `${o.customer_phone}|${dayOf(o.order_date)}`;
          if (seen.has(key)) { dupSkipped++; continue; }
          seen.add(key);
          fileDeduped.push(o);
        }
        try {
          const pairs = fileDeduped
            .map((o) => ({ phone: o.customer_phone, date: dayOf(o.order_date) }))
            .filter((p) => p.phone && p.date);
          if (pairs.length > 0) {
            const existingSet = new Set<string>();
            const DCHUNK = 5000;
            for (let i = 0; i < pairs.length; i += DCHUNK) {
              const existing = await findExistingFn({ data: { pairs: pairs.slice(i, i + DCHUNK) } });
              for (const k of existing) existingSet.add(k);
            }
            const filtered = fileDeduped.filter((o) => {
              const k = `${o.customer_phone}|${dayOf(o.order_date)}`;
              if (existingSet.has(k)) { dupSkipped++; return false; }
              return true;
            });
            workingOrders = filtered;
          } else {
            workingOrders = fileDeduped;
          }
        } catch (e) {
          workingOrders = fileDeduped;
        }
        if (dupSkipped > 0) toast.message(`Skipped ${dupSkipped} duplicate orders (same phone + date)`);
      }

      const BATCH = 100;
      setProgressTotal(workingOrders.length);
      let inserted = 0;
      let failed = 0;
      const errors: { index: number; message: string }[] = [];
      for (let i = 0; i < workingOrders.length; i += BATCH) {
        const slice = workingOrders.slice(i, i + BATCH);
        const res = await importFn({ data: { orders: slice as any } });
        inserted += res.inserted;
        failed += res.failed;
        errors.push(...res.errors.map((e) => ({ index: e.index + i, message: e.message })));
        const done = i + slice.length;
        setProgressDone(done);
        setLiveInserted(inserted);
        setLiveFailed(failed);
        setProgress(Math.round((done / workingOrders.length) * 100));
      }
      setResult({ inserted, failed, errors });
      if (inserted > 0) toast.success(`Imported ${inserted} orders`);
      if (failed > 0) toast.error(`${failed} orders failed`);
      if (failed === 0) onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Legacy Orders — Step {step} of 3</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <Alert>
              <AlertDescription className="text-sm">
                সব হেডার optional: <b>OrderDate, Name, PhoneNo, Address, Email, ProductName, Sku, Price, Quantity, DeliveryCharge, Total, TrackingId, InvoiceNo, Note</b> + যেকোনো কাস্টম কলাম।
                কলাম যে কোনো ক্রমে থাকতে পারে — হেডার নাম দেখে অটো ম্যাচ হবে। ডাটা না থাকলে ডিফল্ট বসবে (Name=Unknown, Phone=N/A ইত্যাদি)। Sku মিললে অগ্রাধিকার, না মিললে নাম দিয়ে; কোনোটাই না মিললে নতুন প্রডাক্ট তৈরি হবে। Price খালি থাকলে Total থেকে হিসাব হবে।
                <div className="mt-2 text-xs text-muted-foreground">
                  CSV ও XLSX দুটোই গ্রহণ — একসাথে ২০০০ পর্যন্ত অর্ডার, ২৫ করে ব্যাচে প্রসেস, লাইভ প্রগ্রেস দেখা যাবে।
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
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Choose CSV / Excel file
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm font-medium">Auto-create missing products</Label>
                <p className="text-xs text-muted-foreground">
                  OMS-এ না থাকা প্রডাক্ট ইম্পোর্টের সময় অটো তৈরি হবে (CSV-র নাম ও দাম দিয়ে)।
                </p>
              </div>
              <Switch checked={autoCreate} onCheckedChange={setAutoCreate} />
            </div>

            {allHeaders.length > 0 && (
              <div className="rounded-md border p-3 space-y-2">
                <Label className="text-sm font-medium">
                  Extra columns (custom info)
                </Label>
                <p className="text-xs text-muted-foreground">
                  স্ট্যান্ডার্ড নয় এমন কলামগুলো অর্ডারের সাথে key/value হিসেবে সেভ হবে। চেক উঠিয়ে দিলে সেই কলাম skip হবে।
                </p>
                <div className="flex flex-wrap gap-2">
                  {allHeaders
                    .filter((h) => columnRoles[h] !== "standard")
                    .map((h) => {
                      const isCustom = columnRoles[h] === "custom";
                      return (
                        <button
                          key={h}
                          type="button"
                          onClick={() =>
                            setColumnRoles((r) => ({
                              ...r,
                              [h]: isCustom ? "skip" : "custom",
                            }))
                          }
                          className={`text-xs px-2 py-1 rounded border ${
                            isCustom
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isCustom ? "✓ " : ""}{h}
                        </button>
                      );
                    })}
                  {allHeaders.filter((h) => columnRoles[h] !== "standard").length === 0 && (
                    <span className="text-xs text-muted-foreground">কোনো অতিরিক্ত কলাম নেই।</span>
                  )}
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {uniqueProducts.filter((n) => productMap.get(n)).length}/{uniqueProducts.length} matched.
              {missingProductCount > 0 && autoCreate && (
                <span className="ml-1 text-emerald-600">
                  {missingProductCount}টি নতুন প্রডাক্ট তৈরি হবে।
                </span>
              )}
            </p>
            <div className="border rounded-md max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CSV Product Name</TableHead>
                    <TableHead>OMS Product</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uniqueProducts.map((n) => (
                    <TableRow key={n}>
                      <TableCell className="font-mono text-xs">
                        {productMap.get(n) ? (
                          <CheckCircle2 className="inline h-4 w-4 text-emerald-500 mr-1" />
                        ) : autoCreate ? (
                          <Badge variant="secondary" className="mr-1 text-[10px]">NEW</Badge>
                        ) : (
                          <AlertCircle className="inline h-4 w-4 text-amber-500 mr-1" />
                        )}
                        {n}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={productMap.get(n) ?? ""}
                          onValueChange={(v) => {
                            const next = new Map(productMap);
                            if (v) next.set(n, v);
                            else next.delete(n);
                            setProductMap(next);
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Select product…" /></SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} {p.sku ? `(${p.sku})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {!result ? (
              <>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground">Total rows</div>
                    <div className="text-2xl font-semibold">{rows.length}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground">Valid orders</div>
                    <div className="text-2xl font-semibold text-emerald-500">{validOrderCount}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground">Skipped rows</div>
                    <div className="text-2xl font-semibold text-amber-500">{invalidRows.length}</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Default status (CSV-এ status কলাম থাকলে সেটা অগ্রাধিকার পাবে; না মিললে এটি প্রযোজ্য)</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="pending_web">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="ready_to_ship">Ready to ship</SelectItem>
                      <SelectItem value="out_of_stock">Out of stock</SelectItem>
                      <SelectItem value="shipped">Shipped</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="returned">Returned</SelectItem>
                      <SelectItem value="no_response">No response</SelectItem>
                      <SelectItem value="fraud">Fraud</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <Label className="text-sm font-medium">Skip duplicates (same phone + same date)</Label>
                    <p className="text-xs text-muted-foreground">
                      একই ফোন + একই তারিখের অর্ডার DB-তে বা ফাইলে already থাকলে নতুন এন্ট্রি হবে না।
                    </p>
                  </div>
                  <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} />
                </div>
                {invalidRows.length > 0 && (
                  <Alert>
                    <AlertDescription className="text-xs max-h-32 overflow-y-auto">
                      <b>{invalidRows.length} rows will be skipped:</b>
                      <ul className="mt-1 space-y-0.5">
                        {invalidRows.slice(0, 20).map((r) => (
                          <li key={r.rowIndex}>
                            Row {r.rowIndex}: {r.errors.join(", ") || "Product not mapped"}
                          </li>
                        ))}
                        {invalidRows.length > 20 && <li>…and {invalidRows.length - 20} more</li>}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                {busy && (
                  <div className="space-y-2">
                    <Progress value={progress} />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Importing… {progressDone} / {progressTotal} ({progress}%)</span>
                      <span>
                        <span className="text-emerald-500">✓ {liveInserted}</span>
                        {liveFailed > 0 && <span className="ml-2 text-destructive">✗ {liveFailed}</span>}
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <Alert>
                  <AlertDescription>
                    <div className="flex items-center gap-2 text-base font-medium">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      Imported {result.inserted} orders
                      {result.failed > 0 && (
                        <Badge variant="destructive">{result.failed} failed</Badge>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
                {result.errors.length > 0 && (
                  <div className="text-xs max-h-40 overflow-y-auto border rounded p-2">
                    {result.errors.map((e, i) => (
                      <div key={i}>Order #{e.index + 1}: {e.message}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={!allMapped}>Next</Button>
            </>
          )}
          {step === 3 && !result && (
            <>
              <Button variant="outline" onClick={() => setStep(2)} disabled={busy}>Back</Button>
              <Button onClick={handleImport} disabled={busy || validOrderCount === 0}>
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</> : `Import ${validOrderCount} orders`}
              </Button>
            </>
          )}
          {result && (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
