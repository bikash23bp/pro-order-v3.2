import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_app/expenses")({
  head: () => ({ meta: [{ title: "Expenses — OMS" }] }),
  component: ExpensesLayout,
});

function ExpensesLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const value =
    path.startsWith("/expenses/accounts") ? "accounts" :
    path.startsWith("/expenses/history") ? "history" :
    path.startsWith("/expenses/recurring") ? "recurring" :
    path.startsWith("/expenses/pnl") ? "pnl" : "overview";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">Track Meta Ads spend and profit/loss.</p>
        </div>
      </div>

      <Tabs value={value}>
        <TabsList>
          <TabsTrigger value="overview" asChild><Link to="/expenses">Overview</Link></TabsTrigger>
          <TabsTrigger value="accounts" asChild><Link to="/expenses/accounts">Meta Ads Accounts</Link></TabsTrigger>
          <TabsTrigger value="history" asChild><Link to="/expenses/history">Expense History</Link></TabsTrigger>
          <TabsTrigger value="recurring" asChild><Link to="/expenses/recurring">Recurring / Auto</Link></TabsTrigger>
          <TabsTrigger value="pnl" asChild><Link to="/expenses/pnl">Profit & Loss</Link></TabsTrigger>
        </TabsList>
      </Tabs>

      <Outlet />
    </div>
  );
}
