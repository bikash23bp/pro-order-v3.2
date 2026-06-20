import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DateRangeFilter,
  getPresetRange,
  type DateRange,
  type PresetKey,
} from "@/components/date-range-filter";
import { RecurringExpensesCard, type ExpenseRule, type UserOrderStats } from "@/components/reports/RecurringExpensesCard";

export const Route = createFileRoute("/_app/expenses/recurring")({
  component: RecurringPage,
});

function RecurringPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const [preset, setPreset] = useState<PresetKey>("thisMonth");
  const [range, setRange] = useState<DateRange>(() => getPresetRange("thisMonth"));

  const fromIso = useMemo(() => range.from.toISOString(), [range]);
  const toIso = useMemo(() => range.to.toISOString(), [range]);

  const rulesQ = useQuery({
    queryKey: ["expense-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_rules")
        .select("id,name,category,amount,frequency,per_order_amount,per_order_pct,assigned_user_id,enabled,start_date,end_date,note")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExpenseRule[];
    },
  });

  const ordersQ = useQuery({
    queryKey: ["expense-rules-orders", fromIso, toIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("created_by,total_amount")
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (error) throw error;
      return data ?? [];
    },
  });

  const orderCount = ordersQ.data?.length ?? 0;
  const orderValueTotal = useMemo(
    () => (ordersQ.data ?? []).reduce((s, o) => s + Number(o.total_amount || 0), 0),
    [ordersQ.data],
  );
  const userStats: UserOrderStats = useMemo(() => {
    const m: UserOrderStats = new Map();
    for (const o of ordersQ.data ?? []) {
      const uid = o.created_by;
      if (!uid) continue;
      const cur = m.get(uid) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(o.total_amount || 0);
      m.set(uid, cur);
    }
    return m;
  }, [ordersQ.data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Preview Range</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <DateRangeFilter
            value={range}
            preset={preset}
            onChange={(r, p) => { setRange(r); setPreset(p); }}
          />
          <p className="text-xs text-muted-foreground">
            Orders in range: <span className="font-medium text-foreground">{orderCount}</span>
            {" — "}per-order খরচ এই সংখ্যা দিয়ে গুণ হয়ে "In Range" কলামে দেখাবে। User-assigned rule হলে শুধু সেই ইউজারের অর্ডার গণ্য।
          </p>
        </CardContent>
      </Card>

      <RecurringExpensesCard
        rules={rulesQ.data ?? []}
        loading={rulesQ.isLoading}
        canManage={isAdmin}
        from={range.from}
        to={range.to}
        orderCount={orderCount}
        userStats={userStats}
        orderValueTotal={orderValueTotal}
        onChange={() => {
          qc.invalidateQueries({ queryKey: ["expense-rules"] });
          qc.invalidateQueries({ queryKey: ["report-recurring-rules"] });
        }}
      />
    </div>
  );
}
