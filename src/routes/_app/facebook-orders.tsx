import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Facebook } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_app/facebook-orders")({
  head: () => ({ meta: [{ title: "Facebook Page Orders — OMS" }] }),
  component: FacebookOrdersLayout,
});

function FacebookOrdersLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const value =
    path.startsWith("/facebook-orders/settings") ? "settings" :
    path.startsWith("/facebook-orders/logs") ? "logs" :
    path.startsWith("/facebook-orders/pages") ? "pages" : "orders";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary/10 text-primary">
          <Facebook className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facebook Page Orders</h1>
          <p className="text-sm text-muted-foreground">Incoming Messenger orders, webhook & API configuration.</p>
        </div>
      </div>

      <Tabs value={value}>
        <TabsList>
          <TabsTrigger value="orders" asChild><Link to="/facebook-orders/orders">Orders</Link></TabsTrigger>
          <TabsTrigger value="settings" asChild><Link to="/facebook-orders/settings">API Settings</Link></TabsTrigger>
          <TabsTrigger value="logs" asChild><Link to="/facebook-orders/logs">Webhook Logs</Link></TabsTrigger>
          <TabsTrigger value="pages" asChild><Link to="/facebook-orders/pages">Connected Pages</Link></TabsTrigger>
        </TabsList>
      </Tabs>

      <Outlet />
    </div>
  );
}
