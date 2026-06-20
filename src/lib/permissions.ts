export type AppPermissions = {
  // Original
  can_delete: boolean;
  can_access_settings: boolean;
  can_manage_users: boolean;
  can_manage_couriers: boolean;
  can_manage_products: boolean;
  can_view_reports: boolean;
  // Added
  can_view_dashboard: boolean;
  can_view_orders: boolean;
  can_view_all_orders: boolean;
  can_manage_orders: boolean;
  can_change_order_status: boolean;
  can_view_web_orders: boolean;
  can_manage_telesales: boolean;
  can_manage_marketing: boolean;
  can_manage_messaging: boolean;
  can_manage_invoice_settings: boolean;
  can_create_users: boolean;
  can_import_data: boolean;
  can_export_data: boolean;
  can_view_staff_report: boolean;
  can_view_profit: boolean;
  can_view_loss: boolean;
  can_manage_courier_api: boolean;
  can_manage_passwords: boolean;
  can_manage_inactivity_lock: boolean;
  can_view_telesales_reports: boolean;
  can_manage_oms_endpoints: boolean;
  can_forward_orders: boolean;
  can_manage_notices: boolean;
  can_manage_db_setup: boolean;
};



export type PermissionKey = keyof AppPermissions;

export const PERMISSION_GROUPS: Array<{
  title: string;
  perms: Array<{ key: PermissionKey; label: string }>;
}> = [
  {
    title: "Dashboard & Orders",
    perms: [
      { key: "can_view_dashboard", label: "View Dashboard" },
      { key: "can_view_orders", label: "View Orders" },
      { key: "can_view_all_orders", label: "View All Users' Orders" },
      { key: "can_manage_orders", label: "Manage Orders" },
      { key: "can_change_order_status", label: "Change Order Status" },
      { key: "can_view_web_orders", label: "View Web Orders" },
    ],
  },
  {
    title: "Reports",
    perms: [
      { key: "can_view_reports", label: "View Reports" },
      { key: "can_view_staff_report", label: "Staff Live Dashboard" },
      { key: "can_view_profit", label: "View Profit" },
      { key: "can_view_loss", label: "View Loss" },
    ],
  },
  {
    title: "Sales & Outreach",
    perms: [
      { key: "can_manage_telesales", label: "Manage TeleSales" },
      { key: "can_view_telesales_reports", label: "View TeleSales Report & Income/Expense" },
      { key: "can_manage_marketing", label: "Manage Marketing" },
      { key: "can_manage_messaging", label: "Manage Messaging (SMS/WhatsApp)" },
    ],
  },
  {
    title: "Data",
    perms: [
      { key: "can_import_data", label: "Import Data" },
      { key: "can_export_data", label: "Export Data" },
    ],
  },
  {
    title: "Admin & Settings",
    perms: [
      { key: "can_access_settings", label: "Access Settings" },
      { key: "can_manage_invoice_settings", label: "Manage Invoice Settings" },
      { key: "can_manage_users", label: "Manage Users" },
      { key: "can_create_users", label: "Create Users" },
      { key: "can_manage_products", label: "Manage Products" },
      { key: "can_manage_couriers", label: "Manage Couriers" },
      { key: "can_manage_courier_api", label: "Manage Courier API Keys" },
      { key: "can_manage_passwords", label: "Set / Reset User Passwords" },
      { key: "can_manage_inactivity_lock", label: "Manage Inactivity Auto-lock" },
      { key: "can_manage_oms_endpoints", label: "Manage OMS Endpoints (send/receive)" },
      { key: "can_forward_orders", label: "Forward Orders to other OMS" },
      { key: "can_manage_notices", label: "Manage Notices (Marquee)" },
      { key: "can_manage_db_setup", label: "Manage Database Setup (sensitive)" },
      { key: "can_delete", label: "Delete Records" },


    ],
  },
];


export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_GROUPS.flatMap(
  (g) => g.perms.map((p) => p.key)
);

export const PERMISSION_LABELS: Record<PermissionKey, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.perms.map((p) => [p.key, p.label]))
) as Record<PermissionKey, string>;

export const EMPTY_PERMISSIONS: AppPermissions = Object.fromEntries(
  ALL_PERMISSION_KEYS.map((k) => [k, false])
) as AppPermissions;

export const FULL_PERMISSIONS: AppPermissions = Object.fromEntries(
  ALL_PERMISSION_KEYS.map((k) => [k, true])
) as AppPermissions;

export function normalizePermissions(raw: Partial<AppPermissions> | null | undefined): AppPermissions {
  const out = { ...EMPTY_PERMISSIONS };
  if (!raw) return out;
  for (const k of ALL_PERMISSION_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}
