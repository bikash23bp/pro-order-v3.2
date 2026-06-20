import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, ShoppingCart, Package, Tags, Truck, Users, Settings, BarChart3,
  UserCircle, MessageSquare, Send, PlugZap, Globe, AlertCircle, Filter, Clock, Printer, ShieldAlert,
  Headset, Megaphone, Facebook, Wallet, ChevronRight, ClipboardList, KeyRound, Boxes, ShieldCheck,
  Hash, ClipboardCheck, LayoutTemplate, Repeat, Tag, Crown, MessageSquareWarning, Activity, PhoneCall,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton,
  SidebarMenuSubItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { canAccessRoute } from "@/lib/rbac";
import { useMyPendingTasksCount } from "@/hooks/use-my-pending-tasks-count";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type LeafItem = { title: string; url: string; icon: LucideIcon };
type GroupItem = { title: string; icon: LucideIcon; children: LeafItem[] };
type SidebarEntry = LeafItem | GroupItem;

const isGroup = (e: SidebarEntry): e is GroupItem => "children" in e;

const entries: SidebarEntry[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Staff Live Dashboard", url: "/staff-live", icon: Activity },
  { title: "Auto Call System", url: "/auto-call", icon: PhoneCall },
  {
    title: "Orders",
    icon: ShoppingCart,
    children: [
      { title: "All Orders", url: "/orders", icon: ClipboardList },
      { title: "Pre-Orders", url: "/orders?status=preorder", icon: Clock },
      { title: "Web Orders", url: "/orders?status=web", icon: Globe },
      { title: "Incomplete Orders", url: "/orders?status=incomplete", icon: AlertCircle },
      { title: "Facebook Page Orders", url: "/orders?status=facebook", icon: Facebook },
    ],
  },
  {
    title: "Customers",
    icon: UserCircle,
    children: [
      { title: "All Customers", url: "/customers", icon: UserCircle },
      { title: "Retail Customers", url: "/customers?tab=retail", icon: UserCircle },
      { title: "Wholesale Customers", url: "/customers?tab=wholesale", icon: UserCircle },
      { title: "Repeat Customers", url: "/customers?tab=repeat", icon: Repeat },
      { title: "Tagged Customers", url: "/customers?tab=tagged", icon: Tag },
      { title: "Membership Customers", url: "/customers?tab=membership", icon: Crown },
      { title: "Blocked Customers", url: "/customers/blocked", icon: ShieldAlert },
    ],
  },
  { title: "Complaints", url: "/complaints", icon: MessageSquareWarning },
  { title: "Tasks & Followup", url: "/tasks", icon: ClipboardCheck },
  { title: "TeleSales", url: "/telesales", icon: Headset },
  { title: "Marketing", url: "/marketing", icon: Megaphone },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Inventory", url: "/inventory", icon: Boxes },
  { title: "Expenses", url: "/expenses", icon: Wallet },
  {
    title: "Catalog",
    icon: Boxes,
    children: [
      { title: "Products", url: "/products", icon: Package },
      { title: "Categories", url: "/categories", icon: Tags },
      { title: "Order Sources", url: "/order-sources", icon: Filter },
    ],
  },
  {
    title: "Couriers",
    icon: Truck,
    children: [
      { title: "Couriers", url: "/couriers", icon: Truck },
      { title: "Courier API Keys", url: "/courier-settings", icon: KeyRound },
    ],
  },
  {
    title: "Messaging",
    icon: MessageSquare,
    children: [
      { title: "SMS", url: "/sms", icon: MessageSquare },
      { title: "SMS Settings", url: "/sms-settings", icon: Send },
    ],
  },
  { title: "Integrations", url: "/integrations", icon: PlugZap },
  {
    title: "Settings",
    icon: ShieldCheck,
    children: [
      { title: "Users", url: "/users", icon: Users },
      { title: "Chat Settings", url: "/chat-settings", icon: MessageSquare },
      { title: "Invoice & Sticker", url: "/invoice-sticker-settings", icon: Printer },
      { title: "Invoice Numbering", url: "/invoice-numbering-settings", icon: Hash },
      { title: "Order Page Templates", url: "/order-page-templates", icon: LayoutTemplate },
      { title: "Advance Payment Sources", url: "/advance-payment-sources", icon: Wallet },
      { title: "General Settings", url: "/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const { user, profile, signOut, role, permissions, isAdmin } = useAuth();
  const pendingTaskCount = useMyPendingTasksCount();

  const { data: appSettings } = useQuery({
    queryKey: ["app-settings-sidebar"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("business_name, logo_url")
        .eq("id", true)
        .maybeSingle();
      return data;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const isActive = (url: string) => {
    const [path] = url.split("?");
    return currentPath === path || currentPath.startsWith(path + "/");
  };

  const dynamicEntries: SidebarEntry[] = entries;

  const visibleEntries = dynamicEntries
    .map((e) => {
      if (!isGroup(e)) return canAccessRoute(e.url, role, permissions) ? e : null;
      const children = e.children.filter((c) => canAccessRoute(c.url, role, permissions));
      return children.length ? { ...e, children } : null;
    })
    .filter((e): e is SidebarEntry => e !== null);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary text-primary-foreground overflow-hidden shrink-0">
            {appSettings?.logo_url ? (
              <img
                src={appSettings.logo_url}
                alt={appSettings.business_name ?? "Logo"}
                className="h-8 w-8 object-cover"
              />
            ) : (
              <Package className="h-4 w-4" />
            )}
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden min-w-0">
            <span className="font-semibold leading-tight truncate">
              {appSettings?.business_name || "OMS"}
            </span>
            <span className="text-xs text-muted-foreground">Order Manager</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleEntries.map((entry) => {
                if (!isGroup(entry)) {
                  const isTasks = entry.url === "/tasks";
                  const showBadge = isTasks && pendingTaskCount > 0;
                  return (
                    <SidebarMenuItem key={entry.title}>
                      <SidebarMenuButton asChild isActive={isActive(entry.url)} tooltip={entry.title}>
                        <Link to={entry.url} className="flex items-center gap-2">
                          <entry.icon className={`h-4 w-4 ${showBadge ? "text-violet-400" : ""}`} />
                          <span className={showBadge ? "text-violet-200 font-medium" : ""}>{entry.title}</span>
                          {showBadge && (
                            <span className="ml-auto inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-[10px] font-semibold rounded-full bg-violet-600 text-white group-data-[collapsible=icon]:hidden">
                              {pendingTaskCount}
                            </span>
                          )}
                          {showBadge && (
                            <span className="hidden group-data-[collapsible=icon]:block absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-violet-500 ring-2 ring-sidebar" />
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }
                const groupActive = entry.children.some((c) => isActive(c.url));
                return (
                  <Collapsible key={entry.title} defaultOpen={groupActive} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton isActive={groupActive} tooltip={entry.title}>
                          <entry.icon className="h-4 w-4" />
                          <span>{entry.title}</span>
                          <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {entry.children.map((child) => {
                            const [path, qs] = child.url.split("?");
                            const search = qs
                              ? Object.fromEntries(new URLSearchParams(qs))
                              : undefined;
                            return (
                              <SidebarMenuSubItem key={child.title}>
                                <SidebarMenuSubButton asChild isActive={isActive(child.url)}>
                                  <Link to={path} search={search as any} className="flex items-center gap-2">
                                    <child.icon className="h-4 w-4" />
                                    <span>{child.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:justify-center">
          <Avatar className="h-8 w-8 shrink-0">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name ?? user?.email ?? "User"} loading="lazy" />}
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
              {(profile?.full_name || user?.email || "U").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="text-xs font-medium truncate">{profile?.full_name ?? user?.email}</div>
            {profile?.full_name && <div className="text-[10px] text-muted-foreground truncate">{user?.email}</div>}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => signOut()} className="justify-start">
          Sign out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
