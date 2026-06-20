import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { listStaffUsers, updateStaffPermissions } from "@/lib/admin-users.functions";
import {
  PERMISSION_GROUPS,
  normalizePermissions,
  type AppPermissions,
} from "@/lib/permissions";

type AppRole = "business_owner" | "admin" | "manager" | "staff" | "user_request";

type Row = {
  id: string;
  email: string | null;
  full_name: string | null;
  pending: boolean;
  role: AppRole;
  permissions: AppPermissions;
};

export const Route = createFileRoute("/_app/new-user-requests")({
  head: () => ({ meta: [{ title: "New User Requests — OMS" }] }),
  component: NewUserRequestsPage,
});

function NewUserRequestsPage() {
  const { isAdmin, loading: authLoading, role } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const fetchUsers = useServerFn(listStaffUsers);
  const savePermissions = useServerFn(updateStaffPermissions);

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
      const users = await fetchUsers();
      const merged: Row[] = ((users ?? []) as any[])
        .filter((p) => Boolean(p.pending) || p.role === "user_request")
        .map((p) => ({
          id: p.id,
          email: p.email,
          full_name: p.full_name,
          pending: Boolean(p.pending) || p.role === "user_request",
          role: (p.role ?? "user_request") as AppRole,
          permissions: normalizePermissions(p.permissions as Partial<AppPermissions> | undefined),
        }));
      setRows(merged);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const updateRole = async (userId: string, newRole: AppRole) => {
    setRows((prev) => prev.map((r) => r.id === userId ? { ...r, role: newRole } : r));
  };

  const togglePerm = (userId: string, key: keyof AppPermissions, value: boolean) => {
    setRows((prev) => prev.map((r) =>
      r.id === userId ? { ...r, permissions: { ...r.permissions, [key]: value } } : r
    ));
  };

  const savePerms = async (row: Row) => {
    setSavingId(row.id);
    try {
      const approvedRole: AppRole = row.role === "user_request" ? "staff" : row.role;
      await savePermissions({ data: { userId: row.id, permissions: row.permissions, role: approvedRole } });
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, role: approvedRole, pending: false } : r));
      toast.success("User access approved");
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
          <h1 className="text-2xl font-semibold tracking-tight">New User Requests</h1>
          <p className="text-sm text-muted-foreground">
            Users awaiting approval. Assign a role and permissions; they will gain access once they sign in.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/users"><ArrowLeft className="h-4 w-4" /> All Users</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${rows.length} pending request${rows.length === 1 ? "" : "s"}`}
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No pending requests.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id} className="align-top">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {(r.full_name || r.email || "U").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium flex items-center gap-1.5">
                          {r.full_name ?? "—"}
                          <Badge variant="outline" className="text-[10px]">Pending signup</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={r.role} onValueChange={(v) => updateRole(r.id, v as AppRole)}>
                      <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user_request" disabled>User request</SelectItem>
                        <SelectItem value="business_owner">Business Owner</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
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
                                  checked={r.permissions[key]}
                                  onCheckedChange={(v) => togglePerm(r.id, key, v)}
                                />
                                <Label htmlFor={`${r.id}-${key}`} className="cursor-pointer">{label}</Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="secondary" onClick={() => savePerms(r)} disabled={savingId === r.id}>
                      {savingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
