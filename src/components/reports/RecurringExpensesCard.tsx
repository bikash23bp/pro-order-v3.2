import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Plus, Trash2, CalendarIcon, Power } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ExpenseFrequency = "one_time" | "daily" | "weekly" | "monthly" | "yearly" | "per_order";

export type ExpenseRule = {
  id: string;
  name: string;
  category: string | null;
  amount: number;
  frequency: ExpenseFrequency;
  per_order_amount: number;
  per_order_pct: number;
  assigned_user_id: string | null;
  enabled: boolean;
  start_date: string;
  end_date: string | null;
  note: string | null;
};

export type UserOrderStats = Map<string, { count: number; total: number }>;

const FREQ_LABEL: Record<ExpenseFrequency, string> = {
  one_time: "One-time",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  per_order: "Per Order",
};

const MS_PER_DAY = 86400000;

const toDateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const parseLocalDate = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const inclusiveDays = (start: Date, end: Date): number =>
  Math.max(0, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1);

export function computeRuleContribution(
  rule: ExpenseRule,
  from: Date,
  to: Date,
  orderCount: number,
  userStats?: UserOrderStats,
  orderValueTotal: number = 0,
): number {
  if (!rule.enabled) return 0;

  const fromDay = toDateOnly(from);
  const toDay = toDateOnly(to);
  if (toDay < fromDay) return 0;

  const ruleStart = parseLocalDate(rule.start_date);
  const ruleEnd = rule.end_date ? parseLocalDate(rule.end_date) : toDay;

  const rangeStart = ruleStart > fromDay ? ruleStart : fromDay;
  const rangeEnd = ruleEnd < toDay ? ruleEnd : toDay;
  if (rangeEnd < rangeStart) return 0;

  const activeDays = inclusiveDays(rangeStart, rangeEnd);
  const totalDays = inclusiveDays(fromDay, toDay);
  const activeFraction = totalDays > 0 ? activeDays / totalDays : 0;

  const amount = Number(rule.amount) || 0;
  const perOrder = Number(rule.per_order_amount) || 0;
  const perOrderPct = Number(rule.per_order_pct) || 0;

  // Scope per-order to assigned user if set
  let scopedCount = orderCount;
  let scopedValue = orderValueTotal;
  if (rule.assigned_user_id) {
    const s = userStats?.get(rule.assigned_user_id);
    scopedCount = s?.count ?? 0;
    scopedValue = s?.total ?? 0;
  }

  let base = 0;
  switch (rule.frequency) {
    case "one_time":
      base = ruleStart >= fromDay && ruleStart <= toDay ? amount : 0;
      break;
    case "daily":
      base = activeDays * amount;
      break;
    case "weekly":
      base = (activeDays / 7) * amount;
      break;
    case "monthly":
      base = (activeDays / 30) * amount;
      break;
    case "yearly":
      base = (activeDays / 365) * amount;
      break;
    case "per_order":
      base = amount * scopedCount * activeFraction;
      break;
  }

  const commission =
    perOrder * scopedCount * activeFraction +
    (perOrderPct / 100) * scopedValue * activeFraction;

  return base + commission;
}

type AssignableUser = { id: string; display_name: string; email: string | null; role: string };

export function RecurringExpensesCard({
  rules,
  loading,
  canManage,
  from,
  to,
  orderCount,
  userStats,
  orderValueTotal = 0,
  onChange,
}: {
  rules: ExpenseRule[];
  loading: boolean;
  canManage: boolean;
  from: Date;
  to: Date;
  orderCount: number;
  userStats?: UserOrderStats;
  orderValueTotal?: number;
  onChange: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [perOrderAmount, setPerOrderAmount] = useState("");
  const [perOrderPct, setPerOrderPct] = useState("");
  const [frequency, setFrequency] = useState<ExpenseFrequency>("monthly");
  const [assignedUserId, setAssignedUserId] = useState<string>("__all__");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<AssignableUser[]>([]);

  useEffect(() => {
    if (!canManage) return;
    (async () => {
      const { data, error } = await supabase.rpc("list_assignable_users");
      if (!error && data) setUsers(data as AssignableUser[]);
    })();
  }, [canManage]);

  const userNameFor = (id: string | null): string => {
    if (!id) return "All";
    return users.find((u) => u.id === id)?.display_name ?? "User";
  };

  const add = async () => {
    if (!name.trim()) return toast.error("Name required");
    const a = parseFloat(amount) || 0;
    const po = parseFloat(perOrderAmount) || 0;
    const pp = parseFloat(perOrderPct) || 0;
    if (a <= 0 && po <= 0 && pp <= 0) return toast.error("Amount, per-order ৳ or % required");
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("expense_rules").insert({
      name: name.trim(),
      category: category.trim() || null,
      amount: a,
      per_order_amount: po,
      per_order_pct: pp,
      assigned_user_id: assignedUserId === "__all__" ? null : assignedUserId,
      frequency,
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate ? endDate.toISOString().slice(0, 10) : null,
      enabled: true,
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Rule added");
    setName(""); setCategory(""); setAmount(""); setPerOrderAmount(""); setPerOrderPct("");
    setFrequency("monthly"); setEndDate(null); setAssignedUserId("__all__");
    onChange();
  };

  const toggle = async (id: string, enabled: boolean) => {
    const { error } = await supabase.from("expense_rules").update({ enabled: !enabled }).eq("id", id);
    if (error) return toast.error(error.message);
    onChange();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    const { error } = await supabase.from("expense_rules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    onChange();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring / Auto Expenses</CardTitle>
        <CardDescription>
          Staff salary, rent, per-order commission (৳ বা %) — নির্দিষ্ট ইউজারের সাথে বাঁধা যায়; ইউজার অর্ডার না নিলে commission কাটবে না।
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <div className="rounded-md border p-3 space-y-3 bg-muted/30">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
              <Input placeholder="Name (e.g. Staff salary)" value={name} onChange={(e) => setName(e.target.value)} className="md:col-span-2" />
              <Input placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
              <Input placeholder="Base amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <Select value={frequency} onValueChange={(v) => setFrequency(v as ExpenseFrequency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQ_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                <SelectTrigger><SelectValue placeholder="Assigned user" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All users / Shared</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.display_name} {u.role ? `· ${u.role}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <div>
                <Label className="text-xs">Per-order ৳</Label>
                <Input placeholder="0" type="number" step="0.01" value={perOrderAmount} onChange={(e) => setPerOrderAmount(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Per-order %</Label>
                <Input placeholder="0" type="number" step="0.01" value={perOrderPct} onChange={(e) => setPerOrderPct(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Start date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                      <CalendarIcon className="h-4 w-4" />
                      {format(startDate, "MMM d, yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs">End date (optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                      <CalendarIcon className="h-4 w-4" />
                      {endDate ? format(endDate, "MMM d, yyyy") : "Ongoing"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={endDate ?? undefined} onSelect={(d) => setEndDate(d ?? null)} initialFocus className={cn("p-3 pointer-events-auto")} />
                    {endDate && (
                      <div className="p-2 border-t"><Button size="sm" variant="ghost" className="w-full" onClick={() => setEndDate(null)}>Clear</Button></div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={add} disabled={busy}><Plus className="h-4 w-4" /> Add Rule</Button>
            </div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead className="text-right">Base</TableHead>
              <TableHead className="text-right">Per Order</TableHead>
              <TableHead className="text-right">In Range</TableHead>
              <TableHead>On/Off</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
            ) : rules.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No recurring rules yet.</TableCell></TableRow>
            ) : rules.map((r) => {
              const contrib = computeRuleContribution(r, from, to, orderCount, userStats, orderValueTotal);
              const perOrderBits: string[] = [];
              if (Number(r.per_order_amount) > 0) perOrderBits.push(`৳${Number(r.per_order_amount).toFixed(2)}`);
              if (Number(r.per_order_pct) > 0) perOrderBits.push(`${Number(r.per_order_pct).toFixed(2)}%`);
              return (
                <TableRow key={r.id} className={cn(!r.enabled && "opacity-50")}>
                  <TableCell className="font-medium">
                    {r.name}
                    {r.category && <span className="ml-2 text-xs text-muted-foreground">· {r.category}</span>}
                    {r.frequency === "one_time" && (
                      <Badge variant="outline" className="ml-2 text-[10px]">{r.start_date}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.assigned_user_id ? (
                      <Badge variant="secondary">{userNameFor(r.assigned_user_id)}</Badge>
                    ) : (
                      <span className="text-xs">All</span>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="secondary">{FREQ_LABEL[r.frequency]}</Badge></TableCell>
                  <TableCell className="text-right">৳ {Number(r.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{perOrderBits.length ? perOrderBits.join(" + ") : "—"}</TableCell>
                  <TableCell className="text-right font-medium text-rose-500">৳ {contrib.toFixed(2)}</TableCell>
                  <TableCell>
                    {canManage ? (
                      <Switch checked={r.enabled} onCheckedChange={() => toggle(r.id, r.enabled)} />
                    ) : (
                      <Power className={cn("h-4 w-4", r.enabled ? "text-emerald-500" : "text-muted-foreground")} />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
