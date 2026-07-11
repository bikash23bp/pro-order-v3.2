import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { FULL_PERMISSIONS, normalizePermissions, type AppPermissions } from "@/lib/permissions";

export type { AppPermissions } from "@/lib/permissions";

export type AppRole = "business_owner" | "admin" | "manager" | "staff" | "user_request";

const ROLE_PRIORITY: AppRole[] = ["business_owner", "admin", "manager", "staff", "user_request"];
const MAIN_ADMIN_EMAIL = "bikash23bp@gmail.com";

type ProfileBundle = {
  role: AppRole;
  permissions: AppPermissions;
  profile: {
    full_name: string | null;
    avatar_url: string | null;
    email: string | null;
    inactivity_lock_enabled: boolean;
    inactivity_lock_seconds: number;
  };
  cachedAt: number;
};

const CACHE_KEY = (uid: string) => `auth:profile:${uid}`;

// Module-level caches dedupe across hook instances
const memCache = new Map<string, ProfileBundle>();
const inflight = new Map<string, Promise<ProfileBundle | null>>();

function readLocal(uid: string): ProfileBundle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProfileBundle;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocal(uid: string, bundle: ProfileBundle) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY(uid), JSON.stringify(bundle));
  } catch {
    /* ignore quota */
  }
}

function clearLocal(uid?: string) {
  if (typeof window === "undefined") return;
  try {
    if (uid) localStorage.removeItem(CACHE_KEY(uid));
    else {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("auth:profile:"))
        .forEach((k) => localStorage.removeItem(k));
    }
  } catch {
    /* ignore */
  }
}

function shouldUseCachedBundle(_bundle: ProfileBundle): boolean {
  // Pending users can be approved by an admin from another browser.
  // Permissions are admin-controlled and must take effect immediately,
  // so cached bundles are only used for instant paint, never to skip refresh.
  return false;
}

function pickHighestRole(rows: Array<{ role: string | null }> | null | undefined): AppRole | null {
  if (!rows?.length) return null;

  const roles = new Set(
    rows
      .map((row) => row.role)
      .filter((role): role is AppRole => ROLE_PRIORITY.includes(role as AppRole)),
  );

  return ROLE_PRIORITY.find((role) => roles.has(role)) ?? null;
}

function isMainAdminEmail(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase() === MAIN_ADMIN_EMAIL;
}

async function fetchProfileBundle(authUser: User): Promise<ProfileBundle | null> {
  const userId = authUser.id;
  const userEmail = authUser.email?.toLowerCase() ?? null;
  const existing = inflight.get(userId);
  if (existing) return existing;

  const p = (async (): Promise<ProfileBundle | null> => {
    let [roleRes, permRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("user_permissions").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("full_name, avatar_url, email, inactivity_lock_enabled, inactivity_lock_seconds").eq("id", userId).maybeSingle(),
    ]);

    let resolvedRole = pickHighestRole(roleRes.data);

    if (isMainAdminEmail(userEmail)) {
      if (roleRes.error || permRes.error || profileRes.error) {
        console.warn("[auth] main admin fallback used after profile load error", {
          role: roleRes.error?.message,
          perm: permRes.error?.message,
          profile: profileRes.error?.message,
        });
      }

      const bundle: ProfileBundle = {
        role: resolvedRole ?? "business_owner",
        permissions: FULL_PERMISSIONS,
        profile: {
          full_name: profileRes.data?.full_name ?? authUser.user_metadata?.full_name ?? null,
          avatar_url: profileRes.data?.avatar_url ?? null,
          email: profileRes.data?.email ?? userEmail,
          inactivity_lock_enabled: profileRes.data?.inactivity_lock_enabled ?? false,
          inactivity_lock_seconds: profileRes.data?.inactivity_lock_seconds ?? 1800,
        },
        cachedAt: Date.now(),
      };
      memCache.set(userId, bundle);
      writeLocal(userId, bundle);
      return bundle;
    }

    if (roleRes.error || permRes.error || profileRes.error) {
      console.warn("[auth] profile load had errors, keeping session", {
        role: roleRes.error?.message,
        perm: permRes.error?.message,
        profile: profileRes.error?.message,
      });
      return null;
    }

    if (!resolvedRole) {
      // Retry once after a short delay — transient network/DB hiccups can
      // return an empty role list even for valid users. Only sign out when
      // the retry also confirms no role exists.
      await new Promise((r) => setTimeout(r, 2500));
      const retry = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (retry.error) {
        console.warn("[auth] role retry errored, keeping session", retry.error.message);
        if (typeof window !== "undefined") {
          const { toast } = await import("sonner");
          toast.error(`Couldn't verify your access: ${retry.error.message}. You stay signed in — please refresh in a moment.`);
        }
        return null;
      }
      resolvedRole = pickHighestRole(retry.data);
      if (!resolvedRole) {
        clearLocal(userId);
        if (typeof window !== "undefined") {
          const { toast } = await import("sonner");
          toast.error(
            `No role is assigned to ${userEmail ?? "your account"}. Ask an admin to grant you access, then sign in again.`,
          );
        }
        await supabase.auth.signOut();
        return null;
      }
    }

    const bundle: ProfileBundle = {
      role: resolvedRole,
      permissions: normalizePermissions(permRes.data as Partial<AppPermissions> | null),
      profile: {
        full_name: profileRes.data?.full_name ?? null,
        avatar_url: profileRes.data?.avatar_url ?? null,
        email: profileRes.data?.email ?? null,
        inactivity_lock_enabled: profileRes.data?.inactivity_lock_enabled ?? false,
        inactivity_lock_seconds: profileRes.data?.inactivity_lock_seconds ?? 1800,
      },
      cachedAt: Date.now(),
    };
    memCache.set(userId, bundle);
    writeLocal(userId, bundle);
    return bundle;
  })();

  inflight.set(userId, p);
  try {
    return await p;
  } finally {
    inflight.delete(userId);
  }
}

function useAuthImpl() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<AppPermissions | null>(null);
  const [profile, setProfile] = useState<ProfileBundle["profile"] | null>(null);
  const lastUidRef = useRef<string | null>(null);

  function applyBundle(b: ProfileBundle) {
    setRole(b.role);
    setPermissions(b.permissions);
    setProfile(b.profile);
  }

  function hydrate(authUser: User) {
    const userId = authUser.id;
    // 1. instant: memory cache
    const mem = memCache.get(userId);
    if (mem) {
      if (mem.role !== "user_request") applyBundle(mem);
      if (shouldUseCachedBundle(mem)) return;
    } else {
      // 2. instant: localStorage cache
      const local = readLocal(userId);
      if (local) {
        memCache.set(userId, local);
        if (local.role !== "user_request") applyBundle(local);
        if (shouldUseCachedBundle(local)) return;
      }
    }
    // 3. background refresh
    setProfileLoading(true);
    fetchProfileBundle(authUser)
      .then((b) => {
        if (b && lastUidRef.current === userId) applyBundle(b);
      })
      .finally(() => setProfileLoading(false));
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);
      if (sess?.user) {
        // Only re-hydrate when the user actually changes — avoids extra
        // profile fetches on TOKEN_REFRESHED / INITIAL_SESSION which cause
        // loading flashes during login.
        if (lastUidRef.current !== sess.user.id) {
          lastUidRef.current = sess.user.id;
          setProfileLoading(true);
          setTimeout(() => hydrate(sess.user), 0);
        }
      } else {
        lastUidRef.current = null;
        setRole(null);
        setPermissions(null);
        setProfile(null);
        setProfileLoading(false);
        clearLocal();
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setUser(sess?.user ?? null);
      if (sess?.user) {
        if (lastUidRef.current !== sess.user.id) {
          lastUidRef.current = sess.user.id;
          setProfileLoading(true);
          hydrate(sess.user);
        }
      }
      setSession(sess);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const refresh = () => {
      memCache.delete(user.id);
      clearLocal(user.id);
      hydrate(user);
    };
    const channel = supabase
      .channel(`auth-profile-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_permissions", filter: `user_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, refresh)
      .subscribe();
    // Cross-instance refresh: any useAuth() that calls refreshProfile broadcasts
    // this event so every other instance in the same tab rehydrates immediately.
    const onLocalRefresh = () => refresh();
    window.addEventListener("auth-profile-changed", onLocalRefresh);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("auth-profile-changed", onLocalRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const signOut = useCallback(() => supabase.auth.signOut(), []);
  const refreshProfile = useCallback(async () => {
    if (!user) return;
    memCache.delete(user.id);
    clearLocal(user.id);
    setProfileLoading(true);
    const b = await fetchProfileBundle(user);
    if (b) applyBundle(b);
    setProfileLoading(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth-profile-changed"));
    }
  }, [user]);

  return useMemo(
    () => ({
      session,
      user,
      loading,
      profileLoading,
      role,
      permissions,
      profile,
      isAdmin: role === "admin" || role === "business_owner",
      isManager: role === "manager",
      isStaff: role === "staff",
      signOut,
      refreshProfile,
    }),
    [session, user, loading, profileLoading, role, permissions, profile, signOut, refreshProfile],
  );
}

type AuthContextValue = ReturnType<typeof useAuthImpl>;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthImpl();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx) return ctx;
  // Fallback: allow use outside provider (e.g. tests / isolated trees).
  // Warn once so we can track any remaining stragglers.
  if (typeof window !== "undefined" && !(window as any).__authProviderWarned) {
    (window as any).__authProviderWarned = true;
    console.warn("[auth] useAuth() called outside <AuthProvider> — falling back to standalone instance");
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useAuthImpl();
}
