import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, RotateCcw, Crown, Eye, Monitor, Smartphone } from "lucide-react";
import {
  DESKTOP_TELE_TEMPLATES, MOBILE_TELE_TEMPLATES, findTeleTemplate,
  type TeleTemplateMeta, type TeleTemplateProps, type TeleRow,
} from "@/lib/tele-templates";

const MOCK_ROW: TeleRow = {
  id: "mock-id",
  name: "Rahim Khan",
  phone: "01711223344",
  address: "House 12, Road 4, Dhanmondi, Dhaka",
  status: "pending",
  last_action: "not_received",
  note: "Customer requested call after 5 PM.",
  assigned_to: "u1",
  assigned_to_name: "Staff A",
  order_count: 3,
  complaint_count: 0,
  order_id: null,
};

function makePreviewProps(): TeleTemplateProps {
  return {
    row: MOCK_ROW,
    isSelected: false,
    staff: [{ id: "u1", name: "Staff A" }, { id: "u2", name: "Staff B" }],
    actions: {
      toggleOne: () => {},
      onAction: () => {},
      onReassign: () => {},
      onOpenDetail: () => {},
      onSaveNote: async () => {},
      onOpenComplaints: () => {},
    },
  };
}

export function TeleTemplatesSettings() {
  const { isAdmin, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [adminDesktop, setAdminDesktop] = useState("tele-table-classic");
  const [adminMobile, setAdminMobile] = useState("tele-mobile-stack");
  const [userDesktop, setUserDesktop] = useState<string | null>(null);
  const [userMobile, setUserMobile] = useState<string | null>(null);
  const [previewDesktop, setPreviewDesktop] = useState<string>("tele-table-classic");
  const [previewMobile, setPreviewMobile] = useState<string>("tele-mobile-stack");

  const previewProps = useMemo(makePreviewProps, []);

  const load = async () => {
    setLoading(true);
    const [{ data: settings }, { data: userData }] = await Promise.all([
      supabase.from("app_settings").select("default_tele_template_desktop, default_tele_template_mobile").maybeSingle(),
      supabase.auth.getUser(),
    ]);
    if (settings) {
      setAdminDesktop((settings as { default_tele_template_desktop?: string }).default_tele_template_desktop ?? "tele-table-classic");
      setAdminMobile((settings as { default_tele_template_mobile?: string }).default_tele_template_mobile ?? "tele-mobile-stack");
    }
    const uid = userData.user?.id;
    if (uid) {
      const { data: pref } = await supabase
        .from("user_preferences")
        .select("tele_template_desktop, tele_template_mobile")
        .eq("user_id", uid)
        .maybeSingle();
      if (pref) {
        setUserDesktop((pref as { tele_template_desktop?: string | null }).tele_template_desktop ?? null);
        setUserMobile((pref as { tele_template_mobile?: string | null }).tele_template_mobile ?? null);
      }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!loading) {
      setPreviewDesktop(userDesktop ?? adminDesktop);
      setPreviewMobile(userMobile ?? adminMobile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const saveUserChoice = async (surface: "desktop" | "mobile", templateId: string | null) => {
    if (!user?.id) return;
    setSaving(`user-${surface}-${templateId ?? "reset"}`);
    const field = surface === "desktop" ? "tele_template_desktop" : "tele_template_mobile";
    const { error } = await supabase
      .from("user_preferences")
      .upsert({ user_id: user.id, [field]: templateId } as never, { onConflict: "user_id" });
    setSaving(null);
    if (error) return toast.error(error.message);
    if (surface === "desktop") setUserDesktop(templateId); else setUserMobile(templateId);
    toast.success(templateId ? "Your template updated" : "Reset to admin default");
  };

  const saveAdminDefault = async (surface: "desktop" | "mobile", templateId: string) => {
    setSaving(`admin-${surface}-${templateId}`);
    const field = surface === "desktop" ? "default_tele_template_desktop" : "default_tele_template_mobile";
    const { error } = await supabase
      .from("app_settings")
      .update({ [field]: templateId } as never)
      .eq("id", true);
    setSaving(null);
    if (error) return toast.error(error.message);
    if (surface === "desktop") setAdminDesktop(templateId); else setAdminMobile(templateId);
    toast.success("Global default updated for everyone");
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Telesales Row Templates</h2>
        <p className="text-sm text-muted-foreground">
          Choose how each customer row is displayed on the Telesales workboard. Desktop and mobile picked independently.
          {isAdmin && " As admin, you can also set the global default."}
        </p>
      </div>

      <Tabs defaultValue="desktop" className="space-y-4">
        <TabsList>
          <TabsTrigger value="desktop">Desktop ({DESKTOP_TELE_TEMPLATES.length})</TabsTrigger>
          <TabsTrigger value="mobile">Mobile ({MOBILE_TELE_TEMPLATES.length})</TabsTrigger>
        </TabsList>

        {(["desktop", "mobile"] as const).map((surface) => {
          const list = surface === "desktop" ? DESKTOP_TELE_TEMPLATES : MOBILE_TELE_TEMPLATES;
          const userChoice = surface === "desktop" ? userDesktop : userMobile;
          const adminDefault = surface === "desktop" ? adminDesktop : adminMobile;
          const adminMeta = findTeleTemplate(adminDefault, surface);
          const effective = userChoice ?? adminDefault;
          const previewId = surface === "desktop" ? previewDesktop : previewMobile;
          const setPreviewId = surface === "desktop" ? setPreviewDesktop : setPreviewMobile;
          const previewMeta = findTeleTemplate(previewId, surface);

          return (
            <TabsContent key={surface} value={surface} className="space-y-3">
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Current admin default:</span>{" "}
                    <Badge variant="outline">{adminMeta.name}</Badge>
                  </div>
                  {userChoice && (
                    <Button variant="outline" size="sm" onClick={() => saveUserChoice(surface, null)} disabled={!!saving}>
                      <RotateCcw className="h-4 w-4" /> Reset to admin default
                    </Button>
                  )}
                </CardHeader>
              </Card>

              <Card className="border-primary/30">
                <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {surface === "desktop" ? <Monitor className="h-4 w-4 text-primary" /> : <Smartphone className="h-4 w-4 text-primary" />}
                    <h3 className="font-semibold">Live preview</h3>
                    <Badge variant="secondary">{previewMeta.name}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Click "Preview" on any template below to see it here.</p>
                </CardHeader>
                <CardContent>
                  <div className={surface === "mobile" ? "mx-auto max-w-sm rounded-xl border bg-muted/30 p-3 pointer-events-none" : "rounded-xl border bg-muted/30 p-4 pointer-events-none"}>
                    {previewMeta.render(previewProps)}
                  </div>
                </CardContent>
              </Card>

              <div className={surface === "desktop" ? "grid gap-4 lg:grid-cols-2" : "grid gap-4 sm:grid-cols-2"}>
                {list.map((tpl) => (
                  <TemplateCard
                    key={tpl.id}
                    tpl={tpl}
                    previewProps={previewProps}
                    isUserChoice={userChoice === tpl.id}
                    isAdminDefault={adminDefault === tpl.id}
                    isEffective={effective === tpl.id}
                    isPreviewing={previewId === tpl.id}
                    isAdmin={isAdmin}
                    saving={saving}
                    onPreview={() => setPreviewId(tpl.id)}
                    onPick={() => saveUserChoice(surface, tpl.id)}
                    onSetGlobal={() => saveAdminDefault(surface, tpl.id)}
                  />
                ))}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function TemplateCard({
  tpl, previewProps, isUserChoice, isAdminDefault, isEffective, isPreviewing, isAdmin, saving, onPreview, onPick, onSetGlobal,
}: {
  tpl: TeleTemplateMeta;
  previewProps: TeleTemplateProps;
  isUserChoice: boolean;
  isAdminDefault: boolean;
  isEffective: boolean;
  isPreviewing: boolean;
  isAdmin: boolean;
  saving: string | null;
  onPreview: () => void;
  onPick: () => void;
  onSetGlobal: () => void;
}) {
  return (
    <Card className={`overflow-hidden transition ${isEffective ? "ring-2 ring-primary border-primary/50" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold">{tpl.name}</h3>
          {isUserChoice && <Badge className="text-[10px]"><Check className="h-3 w-3" /> Your pick</Badge>}
          {isAdminDefault && <Badge variant="outline" className="text-[10px]"><Crown className="h-3 w-3" /> Admin default</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border bg-muted/30 p-3 overflow-hidden pointer-events-none">
          {tpl.render(previewProps)}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={isPreviewing ? "secondary" : "outline"} onClick={onPreview}>
            <Eye className="h-4 w-4" /> {isPreviewing ? "Previewing" : "Preview"}
          </Button>
          <Button size="sm" variant={isUserChoice ? "secondary" : "default"} onClick={onPick} disabled={isUserChoice || !!saving}>
            {isUserChoice ? "Selected" : "Use this template"}
          </Button>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={onSetGlobal} disabled={isAdminDefault || !!saving}>
              {isAdminDefault ? "Global default" : "Set as global default"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
