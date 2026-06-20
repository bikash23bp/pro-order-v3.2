import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from "date-fns";
import { Loader2, Settings2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import {
  getTelesalesPnL,
  listTelesalesCompensation,
  upsertTelesalesCompensation,
  bulkUnassignByStaff,
  type TeleCompensationRow,
} from "@/lib/telesales.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";


type PresetKey = "today" | "last7" | "thisMonth" | "lastMonth" | "custom";
interface DateRange { from: Date; to: Date }

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "last7", label: "7 Days" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
];

function getRange(key: PresetKey): DateRange {
  const now = new Date();
  switch (key) {
    case "today": return { from: startOfDay(now), to: endOfDay(now) };
    case "last7": return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "thisMonth": return { from: startOfMonth(now), to: endOfDay(now) };
    case "lastMonth": {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    default: return { from: startOfMonth(now), to: endOfDay(now) };
  }
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-semibold tabular-nums mt-0.5", tone)}>{value}</p>
      </CardContent>
    </Card>
  );
}

export function TelesalesPnLReport() {
  const { isAdmin } = useAuth();
  const canViewComp = isAdmin;
  const [preset, setPreset] = useState<PresetKey>("thisMonth");
  const [range, setRange] = useState<DateRange>(getRange("thisMonth"));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unassignTarget, setUnassignTarget] = useState<{ id: string; name: string } | null>(null);


  const fromStr = format(range.from, "yyyy-MM-dd");
  const toStr = format(range.to, "yyyy-MM-dd");

  const pnlFn = useServerFn(getTelesalesPnL);
  const unassignFn = useServerFn(bulkUnassignByStaff);
  const qc = useQueryClient();

  const pnlQ = useQuery({
    queryKey: ["tele-pnl", fromStr, toStr],
    queryFn: () => pnlFn({ data: { from: fromStr, to: toStr } }),
  });

  const unassignMut = useMutation({
    mutationFn: (staffId: string) => unassignFn({ data: { staff_id: staffId, only_pending: false } }),
    onSuccess: (r) => {
      toast.success(`${r.count} assignment(s) unassigned`);
      qc.invalidateQueries({ queryKey: ["tele-pnl"] });
      qc.invalidateQueries({ queryKey: ["tele-report"] });
      qc.invalidateQueries({ queryKey: ["telesales-list"] });
      qc.invalidateQueries({ queryKey: ["telesales-counts"] });
      setUnassignTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = pnlQ.data?.rows ?? [];
  const totals = pnlQ.data?.totals;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? "default" : "outline"}
              onClick={() => { setPreset(p.key); setRange(getRange(p.key)); }}
            >
              {p.label}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {format(range.from, "MMM d")} – {format(range.to, "MMM d, yyyy")}
            </span>
            {canViewComp && (
              <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
                <Settings2 className="h-4 w-4 mr-1" /> Compensation
              </Button>
            )}

          </div>
        </CardContent>
      </Card>

      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Revenue" value={`৳ ${totals.revenue.toLocaleString()}`} tone="text-emerald-500" />
          <StatCard label="Product Cost" value={`৳ ${totals.product_cost.toLocaleString()}`} tone="text-amber-500" />
          <StatCard label="Discount" value={`৳ ${totals.discount.toLocaleString()}`} tone="text-muted-foreground" />
          {canViewComp && (
            <>
              <StatCard label="Staff Salary" value={`৳ ${totals.salary.toLocaleString()}`} tone="text-blue-500" />
              <StatCard label="Commission" value={`৳ ${totals.commission.toLocaleString()}`} tone="text-violet-500" />
              <StatCard
                label="Net Profit"
                value={`৳ ${totals.net.toLocaleString()}`}
                tone={totals.net >= 0 ? "text-emerald-500" : "text-destructive"}
              />
            </>
          )}
        </div>
      )}


      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Per-Staff Income / Expense</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {pnlQ.isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              এই রেঞ্জে কোনো ডাটা নেই।
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Product Cost</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  {canViewComp && <TableHead className="text-right">Salary</TableHead>}
                  {canViewComp && <TableHead className="text-right">Commission</TableHead>}
                  {canViewComp && <TableHead className="text-right">Net</TableHead>}
                  {canViewComp && <TableHead className="text-right">Action</TableHead>}

                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.staff_id}>
                    <TableCell className="font-medium">{r.staff_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.orders}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-500">৳ {r.revenue.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-500">৳ {r.product_cost.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">৳ {r.discount.toLocaleString()}</TableCell>
                    {canViewComp && <TableCell className="text-right tabular-nums text-blue-500">৳ {r.salary.toLocaleString()}</TableCell>}
                    {canViewComp && <TableCell className="text-right tabular-nums text-violet-500">৳ {r.commission.toLocaleString()}</TableCell>}
                    {canViewComp && (
                      <TableCell className={cn("text-right tabular-nums font-semibold", r.net >= 0 ? "text-emerald-500" : "text-destructive")}>
                        ৳ {r.net.toLocaleString()}
                      </TableCell>
                    )}
                    {canViewComp && (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setUnassignTarget({ id: r.staff_id, name: r.staff_name })}
                        >
                          <UserMinus className="h-3.5 w-3.5 mr-1" /> Unassign
                        </Button>
                      </TableCell>
                    )}

                  </TableRow>
                ))}
                {totals && (
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{totals.orders}</TableCell>
                    <TableCell className="text-right">৳ {totals.revenue.toLocaleString()}</TableCell>
                    <TableCell className="text-right">৳ {totals.product_cost.toLocaleString()}</TableCell>
                    <TableCell className="text-right">৳ {totals.discount.toLocaleString()}</TableCell>
                    {canViewComp && <TableCell className="text-right">৳ {totals.salary.toLocaleString()}</TableCell>}
                    {canViewComp && <TableCell className="text-right">৳ {totals.commission.toLocaleString()}</TableCell>}
                    {canViewComp && (
                      <TableCell className={cn("text-right", totals.net >= 0 ? "text-emerald-500" : "text-destructive")}>
                        ৳ {totals.net.toLocaleString()}
                      </TableCell>
                    )}
                    {canViewComp && <TableCell />}

                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CompensationDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <AlertDialog open={!!unassignTarget} onOpenChange={(o) => !o && setUnassignTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unassign all customers?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{unassignTarget?.name}</strong> এর সব assignment (pending, complete, hold) unassign হয়ে যাবে।
              কাস্টমার ডাটা ডিলিট হবে না, শুধু অ্যাসাইনমেন্ট সরে যাবে।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unassignMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={unassignMut.isPending}
              onClick={() => unassignTarget && unassignMut.mutate(unassignTarget.id)}
            >
              {unassignMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unassign"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CompensationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const listFn = useServerFn(listTelesalesCompensation);
  const saveFn = useServerFn(upsertTelesalesCompensation);
  const qc = useQueryClient();

  const compQ = useQuery({
    queryKey: ["tele-compensation"],
    queryFn: () => listFn({}),
    enabled: open,
  });

  const [drafts, setDrafts] = useState<Record<string, TeleCompensationRow>>({});
  const rows = useMemo(() => compQ.data ?? [], [compQ.data]);

  const get = (r: TeleCompensationRow) => drafts[r.user_id] ?? r;
  const patch = (id: string, p: Partial<TeleCompensationRow>) => {
    const base = drafts[id] ?? rows.find((x) => x.user_id === id);
    if (!base) return;
    setDrafts((d) => ({ ...d, [id]: { ...base, ...p } }));
  };

  const saveMut = useMutation({
    mutationFn: async (r: TeleCompensationRow) => saveFn({
      data: {
        user_id: r.user_id,
        base_amount: Number(r.base_amount) || 0,
        frequency: r.frequency,
        per_order_amount: Number(r.per_order_amount) || 0,
        per_order_pct: Number(r.per_order_pct) || 0,
        enabled: r.enabled,
      },
    }),
    onSuccess: (_d, r) => {
      toast.success(`Saved ${r.display_name}`);
      setDrafts((d) => { const c = { ...d }; delete c[r.user_id]; return c; });
      qc.invalidateQueries({ queryKey: ["tele-compensation"] });
      qc.invalidateQueries({ queryKey: ["tele-pnl"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Telesales Compensation</DialogTitle>
        </DialogHeader>
        {compQ.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const v = get(r);
              const dirty = !!drafts[r.user_id];
              return (
                <Card key={r.user_id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{r.display_name}</p>
                        <p className="text-xs text-muted-foreground">{r.email}</p>
                      </div>
                      <Button
                        size="sm"
                        disabled={!dirty || saveMut.isPending}
                        onClick={() => saveMut.mutate(v)}
                      >
                        {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <Label className="text-xs">Base Amount (৳)</Label>
                        <Input
                          type="number"
                          value={v.base_amount}
                          onChange={(e) => patch(r.user_id, { base_amount: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Frequency</Label>
                        <Select
                          value={v.frequency}
                          onValueChange={(val) => patch(r.user_id, { frequency: val as "daily" | "weekly" | "monthly" })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Per Order (৳)</Label>
                        <Input
                          type="number"
                          value={v.per_order_amount}
                          onChange={(e) => patch(r.user_id, { per_order_amount: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Per Order (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={v.per_order_pct}
                          onChange={(e) => patch(r.user_id, { per_order_pct: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                কোনো staff পাওয়া যায়নি।
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
