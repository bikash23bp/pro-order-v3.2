import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, FileText, Sticker, Image as ImageIcon, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProductImageUpload } from "@/components/products/ProductImageUpload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  INVOICE_TEMPLATES, STICKER_TEMPLATES, PrintMetaBanner,
  type TemplateMeta, type PrintOrder, type PrintItem,
  generateQrDataUrl,
} from "@/lib/print-templates";


export const Route = createFileRoute("/_app/invoice-sticker-settings")({
  head: () => ({ meta: [{ title: "Invoice & Sticker Settings — OMS" }] }),
  component: SettingsPage,
});

const SAMPLE_ORDER: PrintOrder = {
  id: "sample", order_number: 1042, invoice_number: "INV-2026-00042",
  customer_name: "Rahim Uddin", customer_phone: "01711-223344",
  customer_address: "House 12, Road 4, Dhanmondi, Dhaka 1209",
  subtotal: 1500, delivery_charge: 80, discount_amount: 50, advance_amount: 200,
  total_amount: 1530, invoice_note: "Handle with care · Call before delivery",
  created_at: new Date().toISOString(), created_by_name: "Admin (Bikash)",
  consignment_id: "SF-1042-AB12", courier_name: "Steadfast",
};

const SAMPLE_ITEMS: PrintItem[] = [
  { id: "i1", order_id: "sample", quantity: 2, unit_price: 500, products: { name: "Cotton T-shirt L", sku: "CTL-01" } },
  { id: "i2", order_id: "sample", quantity: 1, unit_price: 500, products: { name: "Denim Jeans 32", sku: "DJ-32" } },
];

function SettingsPage() {
  const [activeInvoice, setActiveInvoice] = useState<string>("invoice-a4-standard");
  const [activeSticker, setActiveSticker] = useState<string>("sticker-4x3-standard");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [savingBiz, setSavingBiz] = useState(false);
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState("");
  const [couriers, setCouriers] = useState<Array<{ id: string; name: string; sticker_template_id: string | null; invoice_template_id: string | null }>>([]);


  useEffect(() => {
    generateQrDataUrl(SAMPLE_ORDER.invoice_number ?? "sample").then(setQr);
    (async () => {
      const [{ data }, { data: cs }] = await Promise.all([
        supabase.from("app_settings").select("active_invoice_template, active_sticker_template, logo_url, business_name, business_phone, business_address").maybeSingle(),
        supabase.from("couriers").select("id, name, sticker_template_id, invoice_template_id").order("name"),
      ]);
      const d = data as any;
      if (d?.active_invoice_template) setActiveInvoice(d.active_invoice_template);
      if (d?.active_sticker_template) setActiveSticker(d.active_sticker_template);
      if (d?.logo_url) setLogoUrl(d.logo_url);
      setBusinessName(d?.business_name ?? "");
      setBusinessPhone(d?.business_phone ?? "");
      setBusinessAddress(d?.business_address ?? "");
      setCouriers((cs ?? []) as any);
      setLoading(false);
    })();

  }, []);

  const saveInvoice = async (id: string) => {
    setActiveInvoice(id);
    const { error } = await supabase.from("app_settings").update({ active_invoice_template: id } as any).eq("id", true);
    if (error) return toast.error(error.message);
    toast.success("Active invoice template saved");
  };
  const saveSticker = async (id: string) => {
    setActiveSticker(id);
    const { error } = await supabase.from("app_settings").update({ active_sticker_template: id } as any).eq("id", true);
    if (error) return toast.error(error.message);
    toast.success("Active sticker template saved");
  };
  const saveLogo = async (url: string | null) => {
    setLogoUrl(url);
    const { error } = await supabase.from("app_settings").update({ logo_url: url } as any).eq("id", true);
    if (error) return toast.error(error.message);
    toast.success("Logo saved");
  };
  const saveCourierSticker = async (courierId: string, templateId: string | null) => {
    setCouriers((cs) => cs.map((c) => (c.id === courierId ? { ...c, sticker_template_id: templateId } : c)));
    const { error } = await supabase.from("couriers").update({ sticker_template_id: templateId } as any).eq("id", courierId);
    if (error) return toast.error(error.message);
    toast.success("Courier sticker updated");
  };
  const saveCourierInvoice = async (courierId: string, templateId: string | null) => {
    setCouriers((cs) => cs.map((c) => (c.id === courierId ? { ...c, invoice_template_id: templateId } : c)));
    const { error } = await supabase.from("couriers").update({ invoice_template_id: templateId } as any).eq("id", courierId);
    if (error) return toast.error(error.message);
    toast.success("Courier invoice updated");
  };

  const saveBusiness = async () => {
    setSavingBiz(true);
    const { error } = await supabase.from("app_settings").update({
      business_name: businessName.trim() || null,
      business_phone: businessPhone.trim() || null,
      business_address: businessAddress.trim() || null,
    } as any).eq("id", true);
    setSavingBiz(false);
    if (error) return toast.error(error.message);
    toast.success("Business information saved");
  };

  const sampleWithLogo: PrintOrder = {
    ...SAMPLE_ORDER,
    logo_url: logoUrl,
    business_name: businessName || null,
    business_phone: businessPhone || null,
    business_address: businessAddress || null,
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoice & Sticker Settings</h1>
        <p className="text-sm text-muted-foreground">Choose the active template used everywhere in the system. Tap a card to set it as active.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading templates…</div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><ImageIcon className="h-4 w-4" />Company Logo</CardTitle>
              <CardDescription className="text-xs">Uploaded logo appears at the top of invoices that support a brand header (e.g. SteadFast EF Style).</CardDescription>
            </CardHeader>
            <CardContent>
              <ProductImageUpload value={logoUrl} onChange={saveLogo} folder="logos" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Business Information</CardTitle>
              <CardDescription className="text-xs">Shown in the invoice header next to your logo (SteadFast EF Style and similar templates).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Business Name</Label>
                  <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your Business" />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone Number</Label>
                  <Input value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} placeholder="01XXXXXXXXX" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Textarea value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} placeholder="Street, City, Postal Code" rows={2} />
              </div>
              <Button onClick={saveBusiness} disabled={savingBiz} size="sm">
                {savingBiz ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save Business Info
              </Button>
            </CardContent>
          </Card>

          <Tabs defaultValue="invoice">
            <TabsList>
              <TabsTrigger value="invoice"><FileText className="h-4 w-4 mr-1" />Invoice Templates</TabsTrigger>
              <TabsTrigger value="sticker"><Sticker className="h-4 w-4 mr-1" />Sticker / Label Templates</TabsTrigger>
            </TabsList>
            <TabsContent value="invoice" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" />Per-Courier Invoice Override</CardTitle>
                  <CardDescription className="text-xs">
                    Each courier can use its own invoice template. না দিলে নিচের default invoice ব্যবহার হবে।
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {couriers.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No couriers configured yet.</div>
                  ) : couriers.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 border rounded p-2">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <Select
                        value={(c as any).invoice_template_id ?? "__default__"}
                        onValueChange={(v) => saveCourierInvoice(c.id, v === "__default__" ? null : v)}
                      >
                        <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__default__">Use default ({activeInvoice})</SelectItem>
                          {INVOICE_TEMPLATES.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <TemplateGrid templates={INVOICE_TEMPLATES} activeId={activeInvoice} onSelect={saveInvoice} qr={qr} sample={sampleWithLogo} />
            </TabsContent>
            <TabsContent value="sticker" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" />Per-Courier Sticker Override</CardTitle>
                  <CardDescription className="text-xs">
                    Each courier can use its own sticker template. না দিলে নিচের default sticker ব্যবহার হবে।
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {couriers.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No couriers configured yet.</div>
                  ) : couriers.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 border rounded p-2">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <Select
                        value={c.sticker_template_id ?? "__default__"}
                        onValueChange={(v) => saveCourierSticker(c.id, v === "__default__" ? null : v)}
                      >
                        <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__default__">Use default ({activeSticker})</SelectItem>
                          {STICKER_TEMPLATES.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <TemplateGrid templates={STICKER_TEMPLATES} activeId={activeSticker} onSelect={saveSticker} qr={qr} sample={sampleWithLogo} />
            </TabsContent>

          </Tabs>
        </>
      )}
    </div>
  );
}

function TemplateGrid({ templates, activeId, onSelect, qr, sample }: {
  templates: TemplateMeta[]; activeId: string; onSelect: (id: string) => void; qr: string; sample: PrintOrder;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
      {templates.map((t) => {
        const isActive = t.id === activeId;
        return (
          <Card
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`cursor-pointer transition-all hover:shadow-lg relative ${isActive ? "ring-2 ring-primary" : ""}`}
          >
            {isActive && (
              <div className="absolute top-2 right-2 z-10 bg-primary text-primary-foreground rounded-full p-1.5 shadow">
                <Check className="h-4 w-4" />
              </div>
            )}
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">{t.name}<span className="text-[10px] font-normal text-muted-foreground border rounded px-1.5 py-0.5">{t.paper}</span></CardTitle>
              <CardDescription className="text-xs">{t.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-44 overflow-hidden rounded border bg-white relative">
                <div className="origin-top-left absolute top-0 left-0" style={{ transform: "scale(0.32)", transformOrigin: "top left" }}>
                  {t.id !== "invoice-steadfast-ef" && (
                    <PrintMetaBanner order={sample} compact={t.paper.includes("in")} />
                  )}
                  {t.render(sample, SAMPLE_ITEMS, qr)}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
