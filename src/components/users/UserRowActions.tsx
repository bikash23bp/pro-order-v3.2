import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MoreVertical, Pencil, Ban, ShieldOff, Trash2, Loader2, CircleCheck, KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateStaffUser, setUserBlocked, removeStaffUser, deleteStaffUser, setUserPassword,
} from "@/lib/admin-users.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

const MAIN_ADMIN_EMAIL = "bikash23bp@gmail.com";

type Props = {
  userId: string;
  fullName: string | null;
  email: string | null;
  isBlocked: boolean;
  disabled?: boolean;
  isSelf?: boolean;
  onChanged: () => void;
};


export function UserRowActions({ userId, fullName, email, isBlocked, disabled, isSelf, onChanged }: Props) {
  const { user, permissions, isAdmin, role } = useAuth();
  const isMeMainAdmin = (user?.email ?? "").toLowerCase() === MAIN_ADMIN_EMAIL;
  const canManagePasswords = isMeMainAdmin || isAdmin || !!permissions?.can_manage_passwords;
  const canRemoteLock = isAdmin || role === "business_owner" || isMeMainAdmin;
  const targetIsMainAdmin = (email ?? "").toLowerCase() === MAIN_ADMIN_EMAIL;

  const update = useServerFn(updateStaffUser);
  const block = useServerFn(setUserBlocked);
  const remove = useServerFn(removeStaffUser);
  const del = useServerFn(deleteStaffUser);
  const setPwd = useServerFn(setUserPassword);

  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  const [name, setName] = useState(fullName ?? "");
  const [mail, setMail] = useState(email ?? "");
  const [confirmText, setConfirmText] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [busy, setBusy] = useState(false);


  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
      setEditOpen(false); setDelOpen(false); setRemoveOpen(false); setBlockOpen(false); setPwdOpen(false);
      setConfirmText(""); setNewPwd(""); setConfirmPwd("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };


  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={disabled}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => { setName(fullName ?? ""); setMail(email ?? ""); setEditOpen(true); }}>
            <Pencil className="h-4 w-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setBlockOpen(true)} disabled={isSelf}>
            {isBlocked ? <><CircleCheck className="h-4 w-4" /> Unblock</> : <><Ban className="h-4 w-4" /> Block</>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRemoveOpen(true)} disabled={isSelf}>
            <ShieldOff className="h-4 w-4" /> Remove access
          </DropdownMenuItem>
          {canManagePasswords && !targetIsMainAdmin && (
            <DropdownMenuItem onClick={() => { setNewPwd(""); setConfirmPwd(""); setPwdOpen(true); }}>
              <KeyRound className="h-4 w-4" /> Set password
            </DropdownMenuItem>
          )}
          {canRemoteLock && !isSelf && !targetIsMainAdmin && (
            <DropdownMenuItem
              onClick={async () => {
                const { error } = await supabase.rpc("admin_lock_user_screen", { target: userId });
                if (error) toast.error(error.message);
                else toast.success(`${fullName ?? email ?? "User"} এর স্ক্রীন লক করা হয়েছে`);
              }}
            >
              <Lock className="h-4 w-4" /> Lock screen
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => { setConfirmText(""); setDelOpen(true); }}
            disabled={isSelf}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Delete user
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit user</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={mail} onChange={(e) => setMail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              disabled={busy || !name.trim() || !mail.trim()}
              onClick={() => run(() => update({ data: { userId, fullName: name.trim(), email: mail.trim() } }), "User updated")}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block / Unblock */}
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isBlocked ? "Unblock user?" : "Block user?"}</DialogTitle>
            <DialogDescription>
              {isBlocked
                ? `${fullName ?? email} আবার লগইন করতে পারবে।`
                : `${fullName ?? email} এই অ্যাপে আর লগইন করতে পারবে না।`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBlockOpen(false)}>Cancel</Button>
            <Button
              variant={isBlocked ? "default" : "destructive"}
              disabled={busy}
              onClick={() => run(() => block({ data: { userId, blocked: !isBlocked } }), isBlocked ? "User unblocked" : "User blocked")}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {isBlocked ? "Unblock" : "Block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove access */}
      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove access?</DialogTitle>
            <DialogDescription>
              সমস্ত permission বন্ধ করা হবে এবং অ্যাকাউন্ট ব্লক হবে। অ্যাকাউন্ট ডিলিট হবে না।
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => run(() => remove({ data: { userId } }), "Access removed")}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Remove access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user permanently?</DialogTitle>
            <DialogDescription>
              এই ক্রিয়া আনডু করা যাবে না। নিশ্চিত করতে নিচে <span className="font-mono font-semibold">DELETE</span> টাইপ করুন।
            </DialogDescription>
          </DialogHeader>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDelOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy || confirmText !== "DELETE"}
              onClick={() => run(() => del({ data: { userId } }), "User deleted")}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set password */}
      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set password</DialogTitle>
            <DialogDescription>
              {fullName ?? email} এর জন্য নতুন পাসওয়ার্ড সেট করুন। ইউজারকে এটা নিজে জানিয়ে দিতে হবে।
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>New password</Label>
              <Input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="কমপক্ষে ৮ অক্ষর"
                autoComplete="new-password"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Confirm password</Label>
              <Input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {newPwd && confirmPwd && newPwd !== confirmPwd && (
              <p className="text-xs text-destructive">পাসওয়ার্ড মিলছে না</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPwdOpen(false)}>Cancel</Button>
            <Button
              disabled={busy || newPwd.length < 8 || newPwd !== confirmPwd}
              onClick={() => run(() => setPwd({ data: { userId, password: newPwd } }), "Password updated")}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Update password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>

  );
}
