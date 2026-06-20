import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { InactivityLockSettingsDialog } from "@/components/InactivityLockSettingsDialog";
import { InactivityLockReportDialog } from "@/components/InactivityLockReportDialog";

const tabs = [
  { to: "/staff-live", label: "Live Dashboard", icon: Activity },
  { to: "/staff-reports", label: "Activity Report", icon: BarChart3 },
] as const;

export function StaffTabs() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin, permissions } = useAuth();
  const canManageLock = isAdmin || permissions?.can_manage_inactivity_lock === true;
  return (
    <div className="border-b mb-4 flex items-center justify-between gap-2">
      <nav className="flex gap-1 -mb-px">
        {tabs.map((t) => {
          const active = path === t.to;
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>
      {canManageLock && (
        <div className="pb-2 flex items-center gap-2">
          <InactivityLockReportDialog />
          <InactivityLockSettingsDialog />
        </div>
      )}
    </div>
  );
}
