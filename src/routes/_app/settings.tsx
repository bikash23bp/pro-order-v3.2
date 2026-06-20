import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { User, Save, LogOut, KeyRound, Truck, Loader2, Palette, Building2, Network, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemePicker } from "@/components/settings/ThemePicker";
import { NoticesManagerCard } from "@/components/settings/NoticesManagerCard";
import { AvatarUploader } from "@/components/users/AvatarUploader";

import { uploadAvatar } from "@/lib/avatar-upload";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — OMS" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, profile, role, permissions, signOut, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [pw, setPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => setFullName(data?.full_name ?? ""));
  }, [user?.id]);

  const initials = (profile?.full_name || user?.email || "U").slice(0, 2).toUpperCase();

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      let avatar_url: string | null | undefined = undefined;
      if (avatarFile) {
        avatar_url = await uploadAvatar(user.id, avatarFile);
      } else if (removeAvatar) {
        avatar_url = null;
      }
      const update: { full_name: string | null; avatar_url?: string | null } = {
        full_name: fullName.trim() || null,
      };
      if (avatar_url !== undefined) update.avatar_url = avatar_url;
      const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
      if (error) throw error;
      setAvatarFile(null);
      setRemoveAvatar(false);
      await refreshProfile();
      toast.success("Profile updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSavingProfile(false);
    }
  };

  const updatePassword = async () => {
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwSaving(false);
    if (error) return toast.error(error.message);
    setPw("");
    toast.success("Password updated");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, security, appearance, and integrations.</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2"><User className="h-4 w-4" />Profile</TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2"><Palette className="h-4 w-4" />Appearance</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><User className="h-4 w-4" />Profile</CardTitle>
              <CardDescription>Your account information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <AvatarUploader
                value={profile?.avatar_url ?? null}
                onChange={(file) => {
                  setAvatarFile(file);
                  setRemoveAvatar(file === null);
                }}
                fallback={initials}
              />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Role:</span>
                <Badge variant="outline" className="capitalize">{role ?? "staff"}</Badge>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email ?? ""} disabled />
              </div>
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
              </div>
              <Button onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save profile
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Security</CardTitle>
              <CardDescription>Change your password.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>New password</Label>
                <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" />
              </div>
              <Button onClick={updatePassword} disabled={pwSaving || !pw}>
                {pwSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Update password
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your permissions</CardTitle>
              <CardDescription>What you can do in this workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-2">
                {permissions && Object.entries(permissions).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="capitalize">{k.replace(/_/g, " ")}</span>
                    <Badge variant={v ? "default" : "secondary"}>{v ? "Allowed" : "Denied"}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Truck className="h-4 w-4" />Courier integrations</CardTitle>
              <CardDescription>Configure courier API credentials.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="secondary"><Link to="/couriers">Couriers</Link></Button>
              <Button asChild variant="secondary"><Link to="/courier-settings">Courier API Keys</Link></Button>
            </CardContent>
          </Card>

          {(role === "admin" || role === "business_owner" || role === "manager" || permissions?.can_manage_oms_endpoints) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Network className="h-4 w-4" />OMS Endpoints</CardTitle>
                <CardDescription>অন্য OMS-এ অর্ডার পাঠানো ও গ্রহণের সেটআপ।</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="secondary"><Link to="/oms-endpoints">Manage OMS Endpoints</Link></Button>
              </CardContent>
            </Card>
          )}

          {permissions?.can_access_settings && <BusinessInfoCard />}
          {permissions?.can_access_settings && <FraudCheckerCard />}
          {(role === "business_owner" || role === "admin" || permissions?.can_manage_notices) && <NoticesManagerCard />}


          {permissions?.can_manage_db_setup && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4" />Database Setup</CardTitle>
                <CardDescription>অন্য Supabase প্রজেক্টে এই অ্যাপের সব টেবিল ও RLS এক ক্লিকে সেটআপ করুন। (Sensitive — পারমিশন থাকলেই দেখাবে)</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="secondary"><Link to="/db-setup">Open Database Setup</Link></Button>
              </CardContent>
            </Card>
          )}


          <Separator />

          <Button variant="destructive" onClick={() => signOut()}>
            <LogOut className="h-4 w-4" />Sign out
          </Button>
        </TabsContent>

        <TabsContent value="appearance">
          <ThemePicker />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ✅ নতুন: Business Name ও Logo আপডেট করার কার্ড
function BusinessInfoCard() {
  const queryClient = useQueryClient();
  const [businessName, setBusinessName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("business_name, logo_url")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        setBusinessName(data?.business_name ?? "");
        setLogoUrl(data?.logo_url ?? "");
        setLoading(false);
      });
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .update({
        business_name: businessName.trim() || null,
        logo_url: logoUrl.trim() || null,
      })
      .eq("id", true);
    setSaving(false);
    if (error) return toast.error(error.message);
    // sidebar cache invalidate করা যাতে সাথে সাথে update দেখায়
    queryClient.invalidateQueries({ queryKey: ["app-settings-sidebar"] });
    toast.success("Business info saved");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />Business Info
        </CardTitle>
        <CardDescription>Sidebar এ যে নাম ও লোগো দেখাবে।</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* লোগো প্রিভিউ */}
        {logoUrl && (
          <div className="flex items-center gap-3">
            <img
              src={logoUrl}
              alt="Business logo"
              className="h-12 w-12 rounded-lg object-cover border"
            />
            <span className="text-sm text-muted-foreground">Current logo</span>
          </div>
        )}
        <div className="space-y-2">
          <Label>Business Name</Label>
          <Input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            disabled={loading}
            placeholder="আপনার ব্যবসার নাম"
          />
        </div>
        <div className="space-y-2">
          <Label>Logo URL</Label>
          <Input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            disabled={loading}
            placeholder="https://..."
          />
          <p className="text-[11px] text-muted-foreground">
            Supabase Storage বা যেকোনো public image URL দিন।
          </p>
        </div>
        <Button onClick={save} disabled={saving || loading}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function FraudCheckerCard() {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.rpc("get_bdcourier_api_key")
      .then(({ data }) => { setApiKey((data as string) ?? ""); setLoading(false); });
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("app_settings")
      .update({ bdcourier_api_key: apiKey.trim() || null }).eq("id", true);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Fraud checker key saved");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Fraud Checker</CardTitle>
        <CardDescription>BDCourier API key for per-courier delivery success checks.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>BDCourier API Key</Label>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={loading} placeholder="Paste your API key" />
        </div>
        <Button onClick={save} disabled={saving || loading}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save
        </Button>
      </CardContent>
    </Card>
  );
}
