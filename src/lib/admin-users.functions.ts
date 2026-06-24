import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALL_PERMISSION_KEYS, FULL_PERMISSIONS } from "@/lib/permissions";

const RoleEnum = z.enum(["business_owner", "admin", "manager", "staff", "user_request"]);

const Permissions = z.object(
  Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, z.boolean()])) as Record<string, z.ZodBoolean>,
);

const Input = z.object({
  email: z.string().trim().email().max(255),
  fullName: z.string().trim().min(1).max(120),
  role: RoleEnum,
  permissions: Permissions,
  password: z.string().min(8).max(128).optional(),
});

async function getAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const createStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const supabaseAdmin = await getAdminClient();

    const email = data.email.toLowerCase();
    const perms = data.role === "admin" || data.role === "business_owner" ? FULL_PERMISSIONS : data.permissions;

    // 1. Already has a profile? Just grant access (and optionally reset password).
    const { data: existingProfile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);

    if (existingProfile?.id) {
      await grantStaffAccess(supabaseAdmin, existingProfile.id, email, data.fullName, data.role, perms);
      if (data.password) {
        const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(existingProfile.id, {
          password: data.password,
          email_confirm: true,
        });
        if (pwErr) throw new Error(pwErr.message);
      }
      return { id: existingProfile.id, email, pending: false };
    }

    // 2. Create the auth user directly. The old pending-invite flow was removed,
    //    so this must not depend on public.pending_user_invites existing.
    const password = data.password ?? generateTempPassword();
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (createErr || !created?.user) {
      const message = createErr?.message ?? "Failed to create user";
      const alreadyExists = /already|exist|registered/i.test(message);
      if (alreadyExists) {
        throw new Error("This email already has an auth account but no user profile. Ask the user to sign in once, then assign access from Users.");
      }
      throw new Error(message);
    }
    const newUserId = created.user.id;

    // 3. Ensure role + permissions + profile immediately for the new auth user.
    await grantStaffAccess(supabaseAdmin, newUserId, email, data.fullName, data.role, perms);
    return {
      id: newUserId,
      email,
      pending: false,
      tempPassword: data.password ? undefined : password,
    };
  });

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function isMissingTelesalesReportPermissionColumn(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const text = [e?.code, e?.message, e?.details, e?.hint].filter(Boolean).join(" ");
  return (
    text.includes("can_view_telesales_reports") &&
    (/PGRST204|42703|schema cache|does not exist/i.test(text))
  );
}

function withoutTelesalesReportPermission(permissions: z.infer<typeof Permissions>) {
  const { can_view_telesales_reports: _missingOnLegacyBackends, ...legacySafePermissions } = permissions;
  return legacySafePermissions;
}

async function upsertUserPermissions(
  db: any,
  userId: string,
  permissions: z.infer<typeof Permissions>,
) {
  const { error } = await db
    .from("user_permissions")
    .upsert({ user_id: userId, ...permissions } as never, { onConflict: "user_id" });

  if (!error) return;
  if (!isMissingTelesalesReportPermissionColumn(error)) throw new Error(error.message);

  const { error: legacyError } = await db
    .from("user_permissions")
    .upsert({ user_id: userId, ...withoutTelesalesReportPermission(permissions) } as never, { onConflict: "user_id" });
  if (legacyError) throw new Error(legacyError.message);
}

export const listStaffUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const supabaseAdmin = await getAdminClient();
    const [profilesRes, rolesRes, permsRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, avatar_url, is_blocked, chat_force_popup, created_at"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("user_permissions").select("*"),
    ]);
    if (profilesRes.error) throw new Error(profilesRes.error.message);
    if (rolesRes.error) throw new Error(rolesRes.error.message);
    if (permsRes.error) throw new Error(permsRes.error.message);

    const roleMap = new Map((rolesRes.data ?? []).map((r) => [r.user_id, r.role]));
    const permMap = new Map((permsRes.data ?? []).map((p) => [p.user_id, p]));
    const realUsers = (profilesRes.data ?? [])
      .filter((p) => roleMap.has(p.id))
      .map((p) => ({
        ...p,
        pending: roleMap.get(p.id) === "user_request",
        role: roleMap.get(p.id) ?? "user_request",
        permissions: permMap.get(p.id) ?? {},
      }));
    return realUsers.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  });

export const updateStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
      role: RoleEnum,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const supabaseAdmin = await getAdminClient();

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", data.userId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);

    if (!profile) throw new Error("User not found");

    await assertNotMainAdmin(supabaseAdmin, data.userId);

    const { error: delErr } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);

    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const updateStaffPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
      permissions: Permissions,
      role: RoleEnum.optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const supabaseAdmin = await getAdminClient();

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", data.userId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);

    if (!profile) throw new Error("User not found");

    await assertNotMainAdmin(supabaseAdmin, data.userId);

    const requestedRole = data.role && data.role !== "user_request" ? data.role : null;
    let appliedRole: z.infer<typeof RoleEnum> | null = requestedRole;

    if (!appliedRole) {
      const { data: currentRole, error: roleLookupErr } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", data.userId)
        .maybeSingle();
      if (roleLookupErr) throw new Error(roleLookupErr.message);
      if (currentRole?.role === "user_request" && Object.values(data.permissions).some(Boolean)) {
        appliedRole = "staff";
      }
    }

    if (appliedRole) {
      const { error: roleDelErr } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
      if (roleDelErr) throw new Error(roleDelErr.message);
      const { error: roleInsErr } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: appliedRole });
      if (roleInsErr) throw new Error(roleInsErr.message);
    }

    await upsertUserPermissions(supabaseAdmin, data.userId, data.permissions);

    return { ok: true, pending: false, role: appliedRole };
  });

export const uploadStaffAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("Expected form data");
    return input;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const supabaseAdmin = await getAdminClient();
    const userId = String(data.get("userId") ?? "");
    if (!z.string().uuid().safeParse(userId).success) throw new Error("Invalid user id");
    await assertNotMainAdmin(supabaseAdmin, userId);

    const avatar = data.get("avatar");
    if (!(avatar instanceof File)) throw new Error("Avatar image is required");
    if (!["image/jpeg", "image/png", "image/webp"].includes(avatar.type)) throw new Error("Only JPG, PNG, or WEBP images are allowed");
    if (avatar.size > 2 * 1024 * 1024) throw new Error("Image must be 2MB or smaller");

    const path = `${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage.from("avatars").upload(path, avatar, {
      cacheControl: "3600",
      upsert: false,
      contentType: avatar.type,
    });
    if (uploadError) throw new Error(uploadError.message);

    const { data: publicUrlData } = supabaseAdmin.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = publicUrlData.publicUrl;
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", userId);
    if (profileError) throw new Error(profileError.message);

    return { url: avatarUrl };
  });

const MAIN_ADMIN_EMAIL = "bikash23bp@gmail.com";
function isMainAdminClaims(claims: unknown): boolean {
  const email = typeof claims === "object" && claims && "email" in claims
    ? String((claims as { email?: unknown }).email ?? "")
    : "";
  return email.toLowerCase() === MAIN_ADMIN_EMAIL;
}

async function ensureAdmin(ctx: { supabase: any; userId: string; claims?: unknown }) {
  if (isMainAdminClaims(ctx.claims)) return;

  const [adminRes, ownerRes] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "business_owner" }),
  ]);
  if (adminRes.error) throw new Error(adminRes.error.message);
  if (ownerRes.error) throw new Error(ownerRes.error.message);
  if (!adminRes.data && !ownerRes.data) throw new Error("Admin access required");
}

async function assertNotMainAdmin(db: any, userId: string) {
  const { data, error } = await db
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if ((data?.email ?? "").toLowerCase() === MAIN_ADMIN_EMAIL) {
    throw new Error("Main admin account is protected");
  }
}

async function grantStaffAccess(
  db: any,
  userId: string,
  email: string,
  fullName: string,
  role: z.infer<typeof RoleEnum>,
  permissions: z.infer<typeof Permissions>,
) {
  const { error: roleDelErr } = await db.from("user_roles").delete().eq("user_id", userId);
  if (roleDelErr) throw new Error(roleDelErr.message);

  const { error: roleInsErr } = await db.from("user_roles").insert({ user_id: userId, role });
  if (roleInsErr) throw new Error(roleInsErr.message);

  await upsertUserPermissions(db, userId, permissions);

  const { error: profileErr } = await db
    .from("profiles")
    .upsert({ id: userId, email, full_name: fullName, is_blocked: false } as never, { onConflict: "id" });
  if (profileErr) throw new Error(profileErr.message);

}

export const updateStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
      fullName: z.string().trim().min(1).max(120),
      email: z.string().trim().email().max(255),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const supabaseAdmin = await getAdminClient();
    await assertNotMainAdmin(supabaseAdmin, data.userId);

    const { data: current } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();

    if (!current) throw new Error("User not found");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.fullName, email: data.email })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const setUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
      blocked: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const supabaseAdmin = await getAdminClient();
    await assertNotMainAdmin(supabaseAdmin, data.userId);
    if (data.userId === context.userId) {
      throw new Error("You cannot block your own account");
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_blocked: data.blocked })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const removeStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const supabaseAdmin = await getAdminClient();
    await assertNotMainAdmin(supabaseAdmin, data.userId);
    if (data.userId === context.userId) {
      throw new Error("You cannot remove your own access");
    }

    const { data: profile, error: lookupErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", data.userId)
      .maybeSingle();
    if (lookupErr) throw new Error(lookupErr.message);
    if (!profile) throw new Error("User not found");

    // Strip all permissions
    const emptyPerms = Object.fromEntries(
      ALL_PERMISSION_KEYS.map((k) => [k, false]),
    );
    await upsertUserPermissions(supabaseAdmin, data.userId, emptyPerms as z.infer<typeof Permissions>);

    // Demote to staff
    const { error: roleDelErr } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (roleDelErr) throw new Error(roleDelErr.message);
    const { error: roleInsErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: "staff" });
    if (roleInsErr) throw new Error(roleInsErr.message);

    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({ is_blocked: true })
      .eq("id", data.userId);
    if (profileErr) throw new Error(profileErr.message);

    return { ok: true };
  });

export const deleteStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const supabaseAdmin = await getAdminClient();
    await assertNotMainAdmin(supabaseAdmin, data.userId);
    if (data.userId === context.userId) {
      throw new Error("You cannot delete your own account");
    }

    const { data: profile, error: profileLookupErr } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();
    if (profileLookupErr) throw new Error(profileLookupErr.message);

    if (!profile) throw new Error("User not found");

    const { error: permErr } = await supabaseAdmin.from("user_permissions").delete().eq("user_id", data.userId);
    if (permErr) throw new Error(permErr.message);
    const { error: roleErr } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (roleErr) throw new Error(roleErr.message);
    const { error: profileErr } = await supabaseAdmin.from("profiles").update({ is_blocked: true }).eq("id", data.userId);
    if (profileErr) throw new Error(profileErr.message);

    return { ok: true };
  });

async function ensurePasswordManager(ctx: { supabase: any; userId: string }) {
  const supabaseAdmin = await getAdminClient();
  // Main admin always allowed
  const { data: meProfile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", ctx.userId)
    .maybeSingle();
  if ((meProfile?.email ?? "").toLowerCase() === MAIN_ADMIN_EMAIL) return;

  // Any admin role is allowed
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (roleRow) return;

  // Otherwise must have can_manage_passwords flag
  const { data: perms, error } = await supabaseAdmin
    .from("user_permissions")
    .select("can_manage_passwords")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!perms?.can_manage_passwords) {
    throw new Error("Permission denied: password management is restricted");
  }
}

export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
      password: z.string().min(8).max(128),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensurePasswordManager(context);
    const supabaseAdmin = await getAdminClient();
    // Even password managers cannot touch the main admin
    await assertNotMainAdmin(supabaseAdmin, data.userId);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      { password: data.password },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });


