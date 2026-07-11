import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Plus, PackagePlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { canAccessRoute } from "@/lib/rbac";
import { GlobalSearch } from "@/components/GlobalSearch";
import { UserProfileMenu } from "@/components/UserProfileMenu";
import { QuickRestockDialog } from "@/components/inventory/QuickRestockDialog";
import { AutoLockControl } from "@/components/AutoLockControl";
import { supabase } from "@/integrations/supabase/client";

// Lazy-load heavy side components so login/first paint isn't blocked by
// their queries and subscriptions all mounting at once.
const InactivityLock = lazy(() => import("@/components/InactivityLock").then(m => ({ default: m.InactivityLock })));
const RemoteLock = lazy(() => import("@/components/RemoteLock").then(m => ({ default: m.RemoteLock })));
const ChatWidget = lazy(() => import("@/components/ChatWidget").then(m => ({ default: m.ChatWidget })));
const DuplicateTopbarAlert = lazy(() => import("@/components/DuplicateTopbarAlert").then(m => ({ default: m.DuplicateTopbarAlert })));
const NoticeMarquee = lazy(() => import("@/components/NoticeMarquee").then(m => ({ default: m.NoticeMarquee })));



export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { loading, profileLoading, session, role, permissions } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const lastDenied = useRef<string | null>(null);
  const [restockOpen, setRestockOpen] = useState(false);
  

  useEffect(() => {
    if (!loading && !session) {
      const redirect = typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : path;
      navigate({ to: "/auth", search: { redirect } });
    }
  }, [loading, session, navigate, path]);

  useEffect(() => {
    // Wait until session + role + permissions are all hydrated before
    // running the access check, otherwise a transient empty state would
    // wrongly fire "Access denied" and bounce the user to /dashboard.
    if (loading || profileLoading) return;
    if (!session) return;
    if (!role || !permissions) {
      // No role assigned — nothing to gate; let the user sit on the current
      // page. use-auth handles signing out with a clear error message.
      return;
    }
    if (!canAccessRoute(path, role, permissions)) {
      if (lastDenied.current !== path) {
        lastDenied.current = path;
        toast.error("Access denied");
      }
      navigate({ to: "/dashboard" });
    }
  }, [loading, profileLoading, session, role, permissions, path, navigate]);

  // Heartbeat: update current user's last_seen_at every 90s while logged in
  useEffect(() => {
    if (!session) return;
    let lastPing = 0;
    const MIN_INTERVAL = 60_000; // throttle: no more than once per minute
    const ping = () => {
      const now = Date.now();
      if (now - lastPing < MIN_INTERVAL) return;
      lastPing = now;
      supabase.rpc("heartbeat").then(() => {});
    };
    ping();
    const id = window.setInterval(ping, 120_000);
    return () => {
      window.clearInterval(id);
    };
  }, [session]);

  // When user navigates TO the orders page, mark the cache stale so it
  // refetches once. No always-on realtime subscription needed here — the
  // orders page owns its own subscription while mounted.
  useEffect(() => {
    if (!session) return;
    if (path === "/orders" || path === "/orders/") {
      queryClient.invalidateQueries({ queryKey: ["orders"], refetchType: "none" });
      window.dispatchEvent(new CustomEvent("orders:changed"));
    }
  }, [session, path, queryClient]);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (!session) return null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <div className="print:hidden contents"><AppSidebar /></div>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between gap-2 border-b px-4 bg-card/40 backdrop-blur sticky top-0 z-10 print:hidden">
            <div className="flex items-center gap-2 shrink-0">
              <SidebarTrigger />
              <h1 className="text-sm font-medium text-muted-foreground hidden lg:block">OMS</h1>
            </div>
            <GlobalSearch />
            <div className="flex items-center gap-2 shrink-0">
              <DuplicateTopbarAlert />
              <AutoLockControl />
              {role && permissions && canAccessRoute("/inventory", role, permissions) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRestockOpen(true)}
                  className="sm:px-3 px-2"
                  title="Restock"
                  aria-label="Restock"
                >
                  <PackagePlus className="h-4 w-4" />
                  <span className="hidden md:inline">Restock</span>
                </Button>
              )}
              {role && permissions && canAccessRoute("/orders/new", role, permissions) && (
                <Button asChild size="sm" className="sm:px-3 px-2" title="New Order" aria-label="New Order">
                  <Link to="/orders/new">
                    <Plus className="h-4 w-4" />
                    <span className="hidden md:inline">Quick New Order</span>
                  </Link>
                </Button>
              )}
              <UserProfileMenu />
            </div>
          </header>
          <NoticeMarquee />
          <main className="flex-1 min-w-0 p-4 sm:p-6">
            <Outlet />
          </main>

        </div>
      </div>
      <QuickRestockDialog open={restockOpen} onOpenChange={setRestockOpen} />
      <Suspense fallback={null}>
        <InactivityLock />
        <RemoteLock />
        <ChatWidget />
      </Suspense>
    </SidebarProvider>
  );
}
