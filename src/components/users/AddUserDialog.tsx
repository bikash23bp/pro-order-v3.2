import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createStaffUser, uploadStaffAvatar } from "@/lib/admin-users.functions";
import { processAvatar } from "@/lib/avatar-upload";
import { AvatarUploader } from "@/components/users/AvatarUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  PERMISSION_GROUPS,
  EMPTY_PERMISSIONS,
  type AppPermissions,
} from "@/lib/permissions";

type AppRole = "business_owner" | "admin" | "manager" | "staff";
type Permissions = AppPermissions;

export function AddUserDialog({ onCreated }: { onCreated: () => void }) {
  const create = useServerFn(createStaffUser);
  const uploadAvatar = useServerFn(uploadStaffAvatar);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("staff");
  const [perms, setPerms] = useState<Permissions>(EMPTY_PERMISSIONS);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");

  const reset = () => {
    setFullName(""); setEmail("");
    setRole("staff"); setPerms(EMPTY_PERMISSIONS);
    setAvatarFile(null);
    setPassword("");
  };

  const submit = async () => {
    if (!fullName.trim() || !email.trim()) {
      toast.error("Fill name and email");
      return;
    }
    if (password && password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      const created = await create({
        data: {
          fullName,
          email,
          role,
          permissions: perms,
          ...(password ? { password } : {}),
        },
      });
      if (avatarFile && created?.id) {
        try {
          const { file } = await processAvatar(avatarFile);
          const formData = new FormData();
          formData.set("userId", created.id);
          formData.set("avatar", file);
          await uploadAvatar({ data: formData });
        } catch (e) {
          toast.warning(`User created but avatar upload failed: ${e instanceof Error ? e.message : "unknown error"}`);
        }
      }
      if (created?.tempPassword) {
        toast.success(`User created. Temporary password: ${created.tempPassword}`, { duration: 20000 });
      } else {
        toast.success("User created. They can sign in now.");
      }
      setOpen(false);
      reset();
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  const isAdmin = role === "admin" || role === "business_owner";

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="h-4 w-4" />Add user</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 shrink-0">
          <DialogTitle>Add new user</DialogTitle>
          <DialogDescription>Create the user with any business email — they can sign in immediately. No email verification needed.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 overflow-y-auto px-6 flex-1 min-h-0">
          <AvatarUploader
            value={null}
            onChange={(file) => setAvatarFile(file)}
            fallback={(fullName || email || "U").slice(0, 2).toUpperCase()}
            size={80}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="nu-name">Full name</Label>
            <Input id="nu-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nu-email">Email</Label>
            <Input id="nu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nu-password">Password <span className="text-xs text-muted-foreground">(optional — leave blank to auto-generate)</span></Label>
            <Input
              id="nu-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              autoComplete="new-password"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="business_owner">Business Owner</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 rounded-md border p-3">
            <div className="text-sm font-medium">Permissions {isAdmin && <span className="text-xs text-muted-foreground">(full access)</span>}</div>
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.title}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{group.title}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {group.perms.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <Switch
                        id={`np-${key}`}
                        checked={isAdmin ? true : perms[key]}
                        disabled={isAdmin}
                        onCheckedChange={(v) => setPerms((p) => ({ ...p, [key]: v }))}
                      />
                      <Label htmlFor={`np-${key}`} className="cursor-pointer">{label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="px-6 pb-6 shrink-0">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Save access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
