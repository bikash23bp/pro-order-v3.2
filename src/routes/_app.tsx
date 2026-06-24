import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
import { InactivityLock } from "@/components/InactivityLock";
import { RemoteLock } from "@/components/RemoteLock";
import { AutoLockControl } from "@/components/AutoLockControl";
import { ChatWidget } from "@/components/ChatWidget";
import { DuplicateTopbarAlert } from "@/components/DuplicateTopbarAlert";
import { NoticeMarquee } from "@/components/NoticeMarquee";
import { supabase } from "@/integrations/supabase/client";



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
    const ping = () => { supabase.rpc("heartbeat").then(() => {}); };
    ping();
    const onVisible = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(ping, 90_000);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session]);

  // Keep the orders cache aware of changes while the user is on other pages.
  // Returning to Orders then shows cached rows immediately and syncs in-place.
  useEffect(() => {
    if (!session || path === "/orders" || path === "/orders/") return;
    let timer: number | null = null;
    const markOrdersChanged = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["orders"], refetchType: "none" });
        window.dispatchEvent(new CustomEvent("orders:changed"));
      }, 4000);
    };
    const channel = supabase
      .channel("orders-cache-sync-away")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, markOrdersChanged)
      .subscribe();
    return () => {
      if (timer) window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
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
      <InactivityLock />
      <RemoteLock />
      <ChatWidget />
    </SidebarProvider>
  );
}
