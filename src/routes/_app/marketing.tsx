import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_app/marketing")({
  head: () => ({ meta: [{ title: "Marketing — OMS" }] }),
  component: MarketingLayout,
});

function MarketingLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const value =
    path.startsWith("/marketing/sms") ? "sms" :
    path.startsWith("/marketing/templates") ? "templates" :
    path.startsWith("/marketing/settings") ? "settings" : "whatsapp";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Marketing</h1>
          <p className="text-sm text-muted-foreground">Bulk customer messaging across WhatsApp and SMS.</p>
        </div>
      </div>

      <Tabs value={value}>
        <TabsList>
          <TabsTrigger value="whatsapp" asChild><Link to="/marketing/whatsapp">WhatsApp</Link></TabsTrigger>
          <TabsTrigger value="sms" asChild><Link to="/marketing/sms">SMS</Link></TabsTrigger>
          <TabsTrigger value="templates" asChild><Link to="/marketing/templates">Templates</Link></TabsTrigger>
          <TabsTrigger value="settings" asChild><Link to="/marketing/settings">Settings</Link></TabsTrigger>
        </TabsList>
      </Tabs>

      <Outlet />
    </div>
  );
}
