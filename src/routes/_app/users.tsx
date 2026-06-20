import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Search, Save, Loader2, Camera, UserPlus2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AddUserDialog } from "@/components/users/AddUserDialog";
import { listStaffUsers, updateStaffPermissions, updateStaffRole, uploadStaffAvatar } from "@/lib/admin-users.functions";
import { listIntegrationLabels } from "@/lib/integrations.functions";
import { listUserSiteAccess, setUserSiteAccess } from "@/lib/user-site-access.functions";
import { listUserOmsAccess, setUserOmsAccess } from "@/lib/user-oms-access.functions";
import { listOmsInbound } from "@/lib/oms-endpoints.functions";
import { UserRowActions } from "@/components/users/UserRowActions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { processAvatar, validateAvatarFile } from "@/lib/avatar-upload";
import { ExportMenu } from "@/components/ExportMenu";
import { useRef } from "react";

import {
  PERMISSION_GROUPS,
  ALL_PERMISSION_KEYS,
  normalizePermissions,
  type AppPermissions,
  type PermissionKey,
} from "@/lib/permissions";

type AppRole = "business_owner" | "admin" | "manager" | "staff" | "user_request";

type Row = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_blocked: boolean;
  chat_force_popup: boolean;
  pending: boolean;
  role: AppRole;
  permissions: AppPermissions;
};

export const Route = createFileRoute("/_app/users")({
  head: () => ({ meta: [{ title: "User Management — OMS" }] }),
  component: UsersPage,
});

function UsersPage() {
  const { isAdmin, loading: authLoading, role, user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [sites, setSites] = useState<{ id: string; name: string | null; site_url: string | null }[]>([]);
  const [siteAccess, setSiteAccess] = useState<Record<string, string[]>>({});
  const [omsSenders, setOmsSenders] = useState<string[]>([]);
  const [omsAccess, setOmsAccess] = useState<Record<string, string[]>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const targetUserIdRef = useRef<string | null>(null);
  const fetchUsers = useServerFn(listStaffUsers);
  const saveRole = useServerFn(updateStaffRole);
  const savePermissions = useServerFn(updateStaffPermissions);
  const uploadAvatar = useServerFn(uploadStaffAvatar);
  const fetchSites = useServerFn(listIntegrationLabels);
  const fetchSiteAccess = useServerFn(listUserSiteAccess);
  const saveSiteAccess = useServerFn(setUserSiteAccess);
  const fetchOmsSenders = useServerFn(listOmsInbound);
  const fetchOmsAccess = useServerFn(listUserOmsAccess);
  const saveOmsAccess = useServerFn(setUserOmsAccess);

  const onPickAvatar = (userId: string) => {
    targetUserIdRef.current = userId;
    fileInputRef.current?.click();
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const userId = targetUserIdRef.current;
    e.target.value = "";
    if (!file || !userId) return;
    const err = validateAvatarFile(file);
    if (err) { toast.error(err); return; }
    setUploadingId(userId);
    try {
      const { file: processed } = await processAvatar(file);
      const formData = new FormData();
      formData.set("userId", userId);
      formData.set("avatar", processed);
      const { url } = await uploadAvatar({ data: formData });
      setRows((prev) => prev.map((r) => r.id === userId ? { ...r, avatar_url: url } : r));
      toast.success("Profile photo updated");
    } catch (err2) {
      toast.error(err2 instanceof Error ? err2.message : "Upload failed");
    } finally {
      setUploadingId(null);
    }
  };

  useEffect(() => {
    if (authLoading || role === null) return;
    if (!isAdmin) {
      toast.error("Admin access required");
      navigate({ to: "/dashboard" });
    }
  }, [authLoading, role, isAdmin, navigate]);

  const load = async () => {
    setLoading(true);
    try {
      const [users, siteList, accessList, omsList, omsAccessList] = await Promise.all([
        fetchUsers(),
        fetchSites().catch(() => []),
        fetchSiteAccess().catch(() => []),
        fetchOmsSenders().catch(() => []),
        fetchOmsAccess().catch(() => []),
      ]);
      const merged: Row[] = ((users ?? []) as any[]).map((p) => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      is_blocked: (p as { is_blocked?: boolean }).is_blocked ?? false,
      chat_force_popup: (p as { chat_force_popup?: boolean }).chat_force_popup ?? false,
      pending: Boolean(p.pending),
      role: (p.role ?? "user_request") as AppRole,
      permissions: normalizePermissions(p.permissions as Partial<AppPermissions> | undefined),
      }));
      setRows(merged);
      setSites((siteList ?? []) as { id: string; name: string | null; site_url: string | null }[]);
      const accMap: Record<string, string[]> = {};
      for (const a of (accessList ?? []) as { user_id: string; site_id: string }[]) {
        (accMap[a.user_id] ||= []).push(a.site_id);
      }
      setSiteAccess(accMap);
      const senders = Array.from(new Set(((omsList ?? []) as Array<{ sender_name: string }>).map((o) => o.sender_name).filter(Boolean))).sort();
      setOmsSenders(senders);
      const omsMap: Record<string, string[]> = {};
      for (const a of (omsAccessList ?? []) as { user_id: string; sender_name: string }[]) {
        (omsMap[a.user_id] ||= []).push(a.sender_name);
      }
      setOmsAccess(omsMap);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const filtered = rows.filter((r) =>
    !q || r.email?.toLowerCase().includes(q.toLowerCase()) || r.full_name?.toLowerCase().includes(q.toLowerCase())
  );

const MAIN_ADMIN_EMAIL = "bikash23bp@gmail.com";
const isMainAdmin = (email: string | null) => (email ?? "").toLowerCase() === MAIN_ADMIN_EMAIL;

  const updateRole = async (userId: string, role: AppRole) => {
    const target = rows.find((r) => r.id === userId);
    if (target && isMainAdmin(target.email)) {
      toast.error("Main admin role cannot be changed");
      return;
    }
    setRows((prev) => prev.map((r) => r.id === userId ? { ...r, role } : r));
    try {
      await saveRole({ data: { userId, role } });
      toast.success(target?.pending ? "Pending role saved" : "Role updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update role");
      load();
    }
  };

  const togglePerm = (userId: string, key: keyof Row["permissions"], value: boolean) => {
    const target = rows.find((r) => r.id === userId);
    if (target && isMainAdmin(target.email)) {
      toast.error("Main admin permissions are locked");
      return;
    }
    setRows((prev) => prev.map((r) =>
      r.id === userId ? { ...r, permissions: { ...r.permissions, [key]: value } } : r
    ));
  };

  const toggleSite = (userId: string, siteId: string, value: boolean) => {
    setSiteAccess((prev) => {
      const cur = new Set(prev[userId] ?? []);
      if (value) cur.add(siteId); else cur.delete(siteId);
      return { ...prev, [userId]: Array.from(cur) };
    });
  };

  const toggleOms = (userId: string, sender: string, value: boolean) => {
    setOmsAccess((prev) => {
      const cur = new Set(prev[userId] ?? []);
      if (value) cur.add(sender); else cur.delete(sender);
      return { ...prev, [userId]: Array.from(cur) };
    });
  };

  const savePerms = async (row: Row) => {
    if (isMainAdmin(row.email)) {
      toast.error("Main admin permissions are locked");
      return;
    }
    setSavingId(row.id);
    try {
      const approvedRole: AppRole = row.role === "user_request" ? "staff" : row.role;
      const result = await savePermissions({ data: { userId: row.id, permissions: row.permissions, role: approvedRole } });
      await saveSiteAccess({ data: { userId: row.id, siteIds: siteAccess[row.id] ?? [] } });
      await saveOmsAccess({ data: { userId: row.id, senderNames: omsAccess[row.id] ?? [] } });
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, role: (result?.role ?? approvedRole) as AppRole, pending: false } : r));
      toast.success(row.pending || row.role === "user_request" ? "User access approved" : "Permissions saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save permissions");
      load();
    } finally {
      setSavingId(null);
    }
  };


  if (!isAdmin) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground">Assign roles and fine-tune per-user permissions.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filenameBase="users"
            count={filtered.length}
            getRows={() => filtered.map((r) => ({
              Email: r.email ?? "",
              Name: r.full_name ?? "",
              Role: r.role,
              Status: r.is_blocked ? "Blocked" : r.pending ? "Pending" : "Active",
            }))}
          />
          <Button asChild variant="outline" size="sm">
            <Link to="/new-user-requests"><UserPlus2 className="h-4 w-4" /> New User Requests</Link>
          </Button>
          <AddUserDialog onCreated={load} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead className="text-right">Save</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No users found.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id} className="align-top">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onPickAvatar(r.id)}
                        disabled={uploadingId === r.id || r.pending}
                        className="group relative shrink-0 rounded-full ring-1 ring-border transition hover:ring-primary/60"
                        aria-label="Change profile photo"
                      >
                        <Avatar className="h-10 w-10">
                          {r.avatar_url && <AvatarImage src={r.avatar_url} alt={r.full_name ?? r.email ?? "User"} loading="lazy" />}
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {(r.full_name || r.email || "U").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
                          {uploadingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                        </span>
                      </button>
                      <div>
                        <div className="font-medium flex items-center gap-1.5">
                          {r.full_name ?? "—"}
                          {r.pending && <Badge variant="outline" className="text-[10px]">Pending signup</Badge>}
                          {r.is_blocked && <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-400 border-red-500/30">Blocked</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                        <Select value={r.role} onValueChange={(v) => updateRole(r.id, v as AppRole)} disabled={isMainAdmin(r.email)}>
                      <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value="user_request" disabled>User request</SelectItem>
                          <SelectItem value="business_owner">Business Owner</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                    {isMainAdmin(r.email)
                      ? <Badge className="mt-1 text-[10px]">Main admin</Badge>
                      : (r.role === "admin" || r.role === "business_owner") && <Badge variant="outline" className="mt-1 text-[10px]">Full access</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-3 min-w-[320px]">
                      {PERMISSION_GROUPS.map((group) => (
                        <div key={group.title}>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{group.title}</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {group.perms.map(({ key, label }) => (
                              <div key={key} className="flex items-center gap-2 text-xs">
                                <Switch
                                  id={`${r.id}-${key}`}
                                  checked={isMainAdmin(r.email) ? true : r.permissions[key]}
                                  disabled={isMainAdmin(r.email)}
                                  onCheckedChange={(v) => togglePerm(r.id, key, v)}
                                />
                                <Label htmlFor={`${r.id}-${key}`} className="cursor-pointer">{label}</Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {sites.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                            Site Access <span className="normal-case text-muted-foreground/70">(এই সাইটের অর্ডারও দেখতে পাবে)</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {sites.map((s) => {
                              const checked = (siteAccess[r.id] ?? []).includes(s.id);
                              const label = s.name || s.site_url?.replace(/^https?:\/\//, "") || s.id.slice(0, 8);
                              return (
                                <div key={s.id} className="flex items-center gap-2 text-xs">
                                  <Switch
                                    id={`${r.id}-site-${s.id}`}
                                    checked={isMainAdmin(r.email) ? true : checked}
                                    disabled={isMainAdmin(r.email)}
                                    onCheckedChange={(v) => toggleSite(r.id, s.id, v)}
                                  />
                                  <Label htmlFor={`${r.id}-site-${s.id}`} className="cursor-pointer truncate" title={label}>
                                    {label}
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {omsSenders.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                            OMS Partner Access <span className="normal-case text-muted-foreground/70">(এই পাটনারের অর্ডার দেখতে পাবে)</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {omsSenders.map((s) => {
                              const checked = (omsAccess[r.id] ?? []).includes(s);
                              return (
                                <div key={s} className="flex items-center gap-2 text-xs">
                                  <Switch
                                    id={`${r.id}-oms-${s}`}
                                    checked={isMainAdmin(r.email) ? true : checked}
                                    disabled={isMainAdmin(r.email)}
                                    onCheckedChange={(v) => toggleOms(r.id, s, v)}
                                  />
                                  <Label htmlFor={`${r.id}-oms-${s}`} className="cursor-pointer truncate" title={s}>
                                    {s}
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="secondary" onClick={() => savePerms(r)} disabled={savingId === r.id || isMainAdmin(r.email)}>
                      {savingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <UserRowActions
                      userId={r.id}
                      fullName={r.full_name}
                      email={r.email}
                      isBlocked={r.is_blocked}
                      disabled={isMainAdmin(r.email)}
                      isSelf={user?.id === r.id}
                      onChanged={load}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleAvatarFile}
      />
    </div>
  );
}
