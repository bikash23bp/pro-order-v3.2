import type { AppPermissions, AppRole } from "@/hooks/use-auth";

type Rule = {
  prefix: string;
  roles: AppRole[];
  permission?: keyof AppPermissions;
};

// Route prefix -> roles (and optional permission flag) that may access it.
const ROUTE_ACCESS: Rule[] = [
  { prefix: "/dashboard", roles: ["admin", "manager", "staff"], permission: "can_view_dashboard" },
  { prefix: "/orders", roles: ["admin", "manager", "staff"], permission: "can_view_orders" },
  { prefix: "/orders/new", roles: ["admin", "manager", "staff"], permission: "can_manage_orders" },
  { prefix: "/preorders", roles: ["admin", "manager", "staff"], permission: "can_view_orders" },
  { prefix: "/web-orders", roles: ["admin", "manager", "staff"], permission: "can_view_web_orders" },
  { prefix: "/incomplete-orders", roles: ["admin", "manager", "staff"], permission: "can_view_orders" },
  { prefix: "/customers", roles: ["admin", "manager", "staff"], permission: "can_view_orders" },
  { prefix: "/complaints", roles: ["admin", "manager", "staff"], permission: "can_manage_orders" },
  { prefix: "/telesales", roles: ["admin", "manager", "staff"], permission: "can_manage_telesales" },
  { prefix: "/marketing", roles: ["admin", "manager", "staff"], permission: "can_manage_marketing" },
  { prefix: "/facebook-orders", roles: ["admin", "manager", "staff"], permission: "can_view_orders" },
  { prefix: "/products", roles: ["admin", "manager", "staff"], permission: "can_manage_products" },
  { prefix: "/categories", roles: ["admin", "manager", "staff"], permission: "can_manage_products" },
  { prefix: "/order-sources", roles: ["admin", "manager", "staff"], permission: "can_manage_orders" },
  { prefix: "/couriers", roles: ["admin", "manager", "staff"], permission: "can_manage_couriers" },
  { prefix: "/courier-settings", roles: ["admin"], permission: "can_manage_courier_api" },
  { prefix: "/sms-settings", roles: ["admin"], permission: "can_manage_messaging" },
  { prefix: "/sms", roles: ["admin", "manager", "staff"], permission: "can_manage_messaging" },
  { prefix: "/integrations", roles: ["admin", "manager", "staff"], permission: "can_access_settings" },
  { prefix: "/reports", roles: ["admin", "manager", "staff"], permission: "can_view_reports" },
  { prefix: "/expenses", roles: ["admin", "manager", "staff"], permission: "can_view_reports" },
  { prefix: "/invoice-sticker-settings", roles: ["admin"], permission: "can_manage_invoice_settings" },
  { prefix: "/invoice-numbering-settings", roles: ["admin"], permission: "can_manage_invoice_settings" },
  { prefix: "/order-page-templates", roles: ["admin", "manager", "staff"], permission: "can_view_orders" },
  { prefix: "/tasks", roles: ["admin", "manager", "staff"], permission: "can_manage_telesales" },
  { prefix: "/users", roles: ["admin"], permission: "can_manage_users" },
  { prefix: "/chat-settings", roles: ["admin"] },
  { prefix: "/staff-live", roles: ["admin", "manager", "staff"], permission: "can_view_staff_report" },
  { prefix: "/staff-reports", roles: ["admin", "manager", "staff"], permission: "can_view_staff_report" },
  { prefix: "/auto-call", roles: ["admin", "manager", "staff"], permission: "can_manage_telesales" },
  { prefix: "/settings", roles: ["admin", "manager", "staff"] },
  { prefix: "/inventory", roles: ["admin", "manager", "staff"], permission: "can_view_reports" },
  { prefix: "/db-setup", roles: [], permission: "can_manage_db_setup" },
  
  
];

export function canAccessRoute(
  path: string,
  role: AppRole | null,
  permissions?: AppPermissions | null,
): boolean {
  if (!role) return false;
  const match = [...ROUTE_ACCESS]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((r) => path === r.prefix || path.startsWith(r.prefix + "/"));
  if (!match) return true;
  // Sensitive routes: permission-only, no role bypass (even admin/owner)
  if (path === "/db-setup" || path.startsWith("/db-setup/")) {
    return !!permissions?.can_manage_db_setup;
  }
  if (role === "business_owner" || role === "admin") return true;
  if (match.permission) return !!permissions?.[match.permission];
  return match.roles.includes(role);
}


export function visibleSidebarItems<T extends { url: string }>(
  items: T[],
  role: AppRole | null,
  permissions?: AppPermissions | null,
): T[] {
  if (!role) return [];
  return items.filter((i) => canAccessRoute(i.url, role, permissions));
}
