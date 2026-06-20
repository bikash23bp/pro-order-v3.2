import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Package, AlertTriangle, XCircle, Wallet, Plus, Download, Trash2, Pencil, Eye } from "lucide-react";

const InventoryOverviewCharts = lazy(() => import("@/components/charts/InventoryOverviewCharts"));
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportCSV, exportPDF, downloadXlsx } from "@/lib/export-utils";
import {
  getInventoryDashboard, getMonthlyPurchases, getStockInOut,
  getCurrentStock, getLowStock, getOutOfStock, getInventoryValuation, getStockMovements,
  getSupplierDues, getWarehouseReport,
} from "@/lib/inventory-reports.functions";
import {
  listSuppliers, upsertSupplier, deleteSupplier,
  listWarehouses, upsertWarehouse, deleteWarehouse,
  listPurchases, createPurchase, getPurchaseDetail,
  listSupplierReturns, createSupplierReturn, listSupplierPurchasesForReturn,
  recordSupplierPayment,
} from "@/lib/inventory.functions";
import { QuickRestockDialog } from "@/components/inventory/QuickRestockDialog";

export const Route = createFileRoute("/_app/inventory")({ component: InventoryPage });

const Empty = ({ msg = "কোনো ডেটা নেই" }: { msg?: string }) => (
  <div className="py-12 text-center text-sm text-muted-foreground">{msg}</div>
);

const fmt = (n: number) => "৳" + Number(n || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 });

function ExportBar({ filename, headers, rows }: { filename: string; headers: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return null;
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => {
        const obj = rows.map((r) => Object.fromEntries(r.map((v, i) => [headers[i], v])));
        exportCSV(filename, obj);
      }}><Download className="h-4 w-4" /> CSV</Button>
      <Button size="sm" variant="outline" onClick={() => {
        const obj = rows.map((r) => Object.fromEntries(r.map((v, i) => [headers[i], v])));
        downloadXlsx(filename, obj);
      }}><Download className="h-4 w-4" /> Excel</Button>
      <Button size="sm" variant="outline" onClick={() => exportPDF({ title: filename, headers, rows })}>
        <Download className="h-4 w-4" /> PDF
      </Button>
    </div>
  );
}

function InventoryPage() {
  const [tab, setTab] = useState("overview");
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Inventory & Suppliers</h1>
        <p className="text-sm text-muted-foreground">Stock, purchases, suppliers, and reporting</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="low">Low Stock</TabsTrigger>
          <TabsTrigger value="out">Out of Stock</TabsTrigger>
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="dues">Dues</TabsTrigger>
          <TabsTrigger value="returns">Returns</TabsTrigger>
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="warehouse-report">Warehouse Report</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><Overview /></TabsContent>
        <TabsContent value="stock"><StockTab /></TabsContent>
        <TabsContent value="low"><LowStockTab /></TabsContent>
        <TabsContent value="out"><OutOfStockTab /></TabsContent>
        <TabsContent value="valuation"><ValuationTab /></TabsContent>
        <TabsContent value="movements"><MovementsTab /></TabsContent>
        <TabsContent value="suppliers"><SuppliersTab /></TabsContent>
        <TabsContent value="purchases"><PurchasesTab /></TabsContent>
        <TabsContent value="dues"><DuesTab /></TabsContent>
        <TabsContent value="returns"><ReturnsTab /></TabsContent>
        <TabsContent value="warehouses"><WarehousesTab /></TabsContent>
        <TabsContent value="warehouses"><WarehousesTab /></TabsContent>
        <TabsContent value="warehouse-report"><WarehouseReportTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function WarehouseReportTab() {
  const fn = useServerFn(getWarehouseReport);
  const fnWh = useServerFn(listWarehouses);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [warehouseId, setWarehouseId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => { fnWh().then((r) => setWarehouses((r ?? []) as Array<{ id: string; name: string }>)).catch(() => setWarehouses([])); }, [fnWh]);
  const { rows, loading } = useList(
    () => fn({ data: {
      warehouse_id: warehouseId === "all" ? undefined : warehouseId,
      from: from || undefined,
      to: to || undefined,
      search: search || undefined,
    } }),
    [warehouseId, from, to, search],
  );

  // Group by warehouse for totals
  const grouped = useMemo(() => {
    const m = new Map<string, { name: string; in: number; out: number; net: number; value: number; items: typeof rows }>();
    for (const r of rows) {
      const key = r.warehouse_id ?? "none";
      const cur = m.get(key) ?? { name: r.warehouse_name, in: 0, out: 0, net: 0, value: 0, items: [] as typeof rows };
      cur.in += r.total_in; cur.out += r.total_out; cur.net += r.net_qty; cur.value += r.value;
      cur.items.push(r);
      m.set(key, cur);
    }
    return Array.from(m.entries()).map(([k, v]) => ({ key: k, ...v }));
  }, [rows]);

  const totals = rows.reduce((a, r) => ({ in: a.in + r.total_in, out: a.out + r.total_out, net: a.net + r.net_qty, value: a.value + r.value }), { in: 0, out: 0, net: 0, value: 0 });
  const exportRows = rows.map((r) => [r.warehouse_name, r.product_name, r.product_sku ?? "", r.total_in, r.total_out, r.net_qty, fmt(r.value)]);

  return (
    <div className="space-y-3 mt-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warehouses</SelectItem>
              {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          <Input placeholder="Search product..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
        </div>
        <ExportBar filename="warehouse-report" headers={["Warehouse", "Product", "SKU", "In", "Out", "Net", "Value"]} rows={exportRows} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total In</p><p className="text-xl font-bold text-green-600">+{totals.in}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Out</p><p className="text-xl font-bold text-red-600">-{totals.out}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Net Qty</p><p className="text-xl font-bold">{totals.net}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Stock Value</p><p className="text-xl font-bold">{fmt(totals.value)}</p></CardContent></Card>
      </div>

      {loading ? <Card><CardContent><Empty msg="Loading..." /></CardContent></Card> :
        grouped.length === 0 ? <Card><CardContent><Empty /></CardContent></Card> :
        grouped.map((g) => (
          <Card key={g.key}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">{g.name}</CardTitle>
              <div className="text-xs text-muted-foreground flex gap-3">
                <span className="text-green-600">In: +{g.in}</span>
                <span className="text-red-600">Out: -{g.out}</span>
                <span>Net: <b>{g.net}</b></span>
                <span>Value: <b>{fmt(g.value)}</b></span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead>In</TableHead><TableHead>Out</TableHead><TableHead>Net</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
                <TableBody>{g.items.map((it) => (
                  <TableRow key={`${g.key}-${it.product_id}`}>
                    <TableCell>{it.product_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{it.product_sku ?? "—"}</TableCell>
                    <TableCell className="text-green-600">+{it.total_in}</TableCell>
                    <TableCell className="text-red-600">-{it.total_out}</TableCell>
                    <TableCell className="font-medium">{it.net_qty}</TableCell>
                    <TableCell className="text-right">{fmt(it.value)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}

function Overview() {
  const fnDash = useServerFn(getInventoryDashboard);
  const fnPurch = useServerFn(getMonthlyPurchases);
  const fnMove = useServerFn(getStockInOut);
  const [d, setD] = useState<Awaited<ReturnType<typeof getInventoryDashboard>> | null>(null);
  const [purchases, setPurchases] = useState<Array<{ month: string; total: number }>>([]);
  const [moves, setMoves] = useState<Array<{ month: string; in: number; out: number }>>([]);
  useEffect(() => {
    fnDash().then(setD).catch(() => setD(null));
    fnPurch().then(setPurchases).catch(() => setPurchases([]));
    fnMove().then(setMoves).catch(() => setMoves([]));
  }, [fnDash, fnPurch, fnMove]);
  const cards = [
    { label: "Total Stock Value", value: fmt(d?.stockValue ?? 0), icon: Package, color: "text-blue-500" },
    { label: "Total Supplier Due", value: fmt(d?.totalDue ?? 0), icon: Wallet, color: "text-amber-500" },
    { label: "Low Stock", value: d?.lowCount ?? 0, icon: AlertTriangle, color: "text-orange-500" },
    { label: "Out of Stock", value: d?.outCount ?? 0, icon: XCircle, color: "text-red-500" },
  ];
  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-xl md:text-2xl font-bold mt-1">{c.value}</p>
              </div>
              <c.icon className={`h-8 w-8 ${c.color}`} />
            </CardContent>
          </Card>
        ))}
      </div>
      <Suspense fallback={<div className="grid lg:grid-cols-2 gap-4"><div className="h-[320px] rounded-lg border bg-muted/20" /><div className="h-[320px] rounded-lg border bg-muted/20" /></div>}>
        <InventoryOverviewCharts purchases={purchases} moves={moves} />
      </Suspense>
    </div>
  );
}

function useList<T>(fn: () => Promise<T[]>, deps: unknown[] = []) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fn().then((r) => setRows(r ?? [])).catch(() => setRows([])).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { rows, setRows, loading };
}

function StockTab() {
  const fn = useServerFn(getCurrentStock);
  const [search, setSearch] = useState("");
  const { rows, loading } = useList(() => fn({ data: { search: search || undefined } }), [search]);
  const exportRows = rows.map((r) => {
    const qty = Number(r.stock_quantity ?? 0);
    const cost = Number(r.cost_price ?? 0);
    const price = Number(r.price ?? 0);
    return [r.name, r.sku ?? "", qty, fmt(cost), fmt(price), fmt(qty * cost), fmt(qty * price)];
  });
  const totals = rows.reduce(
    (acc, r) => {
      const qty = Number(r.stock_quantity ?? 0);
      acc.cost += qty * Number(r.cost_price ?? 0);
      acc.sell += qty * Number(r.price ?? 0);
      return acc;
    },
    { cost: 0, sell: 0 },
  );
  return (
    <div className="space-y-3 mt-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <Input placeholder="Search product..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <ExportBar filename="current-stock" headers={["Product", "SKU", "Qty", "Cost", "Price", "Total Cost", "Total Sell"]} rows={exportRows} />
      </div>
      <Card><CardContent className="p-0">
        {loading ? <Empty msg="Loading..." /> : rows.length === 0 ? <Empty /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead>Stock</TableHead><TableHead>Cost</TableHead><TableHead>Price</TableHead><TableHead>Total Cost</TableHead><TableHead>Total Sell</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((r) => {
              const qty = Number(r.stock_quantity ?? 0);
              const cost = Number(r.cost_price ?? 0);
              const price = Number(r.price ?? 0);
              return (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.sku ?? "—"}</TableCell>
                <TableCell><Badge variant={qty <= 0 ? "destructive" : qty <= (r.low_stock_threshold ?? 5) ? "secondary" : "outline"}>{qty}</Badge></TableCell>
                <TableCell>{fmt(cost)}</TableCell>
                <TableCell>{fmt(price)}</TableCell>
                <TableCell className="font-medium">{fmt(qty * cost)}</TableCell>
                <TableCell className="font-medium">{fmt(qty * price)}</TableCell>
              </TableRow>
              );
            })}</TableBody>
            <tfoot className="border-t bg-muted/50 font-medium">
              <TableRow>
                <TableCell colSpan={5} className="text-right">Total</TableCell>
                <TableCell>{fmt(totals.cost)}</TableCell>
                <TableCell>{fmt(totals.sell)}</TableCell>
              </TableRow>
            </tfoot>
          </Table>
        )}

      </CardContent></Card>
    </div>
  );
}

function LowStockTab() {
  const fn = useServerFn(getLowStock);
  const { rows, loading } = useList(() => fn());
  const exportRows = rows.map((r) => [r.name, r.sku ?? "", r.stock_quantity, r.low_stock_threshold ?? 5]);
  return (
    <div className="space-y-3 mt-4">
      <div className="flex justify-end"><ExportBar filename="low-stock" headers={["Product", "SKU", "Stock", "Threshold"]} rows={exportRows} /></div>
      <Card><CardContent className="p-0">
        {loading ? <Empty msg="Loading..." /> : rows.length === 0 ? <Empty msg="No low stock products 🎉" /> : (
          <Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead>Stock</TableHead><TableHead>Threshold</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-xs">{r.sku ?? "—"}</TableCell>
                <TableCell><Badge variant="secondary">{r.stock_quantity}</Badge></TableCell>
                <TableCell>{r.low_stock_threshold ?? 5}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}

function OutOfStockTab() {
  const fn = useServerFn(getOutOfStock);
  const { rows, loading } = useList(() => fn());
  const exportRows = rows.map((r) => [r.name, r.sku ?? ""]);
  return (
    <div className="space-y-3 mt-4">
      <div className="flex justify-end"><ExportBar filename="out-of-stock" headers={["Product", "SKU"]} rows={exportRows} /></div>
      <Card><CardContent className="p-0">
        {loading ? <Empty msg="Loading..." /> : rows.length === 0 ? <Empty msg="Everything in stock ✅" /> : (
          <Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>SKU</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((r) => (
              <TableRow key={r.id}><TableCell>{r.name}</TableCell><TableCell className="text-xs">{r.sku ?? "—"}</TableCell></TableRow>
            ))}</TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}

function ValuationTab() {
  const fn = useServerFn(getInventoryValuation);
  const { rows, loading } = useList(() => fn());
  const totalCost = rows.reduce((s, r) => s + r.stock_value, 0);
  const totalRetail = rows.reduce((s, r) => s + r.retail_value, 0);
  const exportRows = rows.map((r) => [r.name, r.sku ?? "", r.stock_quantity, fmt(r.stock_value), fmt(r.retail_value)]);
  return (
    <div className="space-y-3 mt-4">
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Cost Value</p><p className="text-xl font-bold">{fmt(totalCost)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Retail Value</p><p className="text-xl font-bold">{fmt(totalRetail)}</p></CardContent></Card>
      </div>
      <div className="flex justify-end"><ExportBar filename="valuation" headers={["Product", "SKU", "Qty", "Cost Value", "Retail Value"]} rows={exportRows} /></div>
      <Card><CardContent className="p-0">
        {loading ? <Empty msg="Loading..." /> : rows.length === 0 ? <Empty /> : (
          <Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Qty</TableHead><TableHead>Cost Value</TableHead><TableHead>Retail Value</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((r) => (
              <TableRow key={r.id}><TableCell>{r.name}</TableCell><TableCell>{r.stock_quantity}</TableCell><TableCell>{fmt(r.stock_value)}</TableCell><TableCell>{fmt(r.retail_value)}</TableCell></TableRow>
            ))}</TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}

function MovementsTab() {
  const fn = useServerFn(getStockMovements);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState("all");
  const { rows, loading } = useList(() => fn({ data: { from: from || undefined, to: to || undefined, type: type === "all" ? undefined : type } }), [from, to, type]);
  const exportRows = rows.map((r) => {
    const row = r as { created_at: string; type: string; quantity: number; products?: { name?: string } | null; unit_cost: number };
    return [new Date(row.created_at).toLocaleString(), row.products?.name ?? "—", row.type, row.quantity, fmt(Number(row.unit_cost))];
  });
  return (
    <div className="space-y-3 mt-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="purchase">Purchase</SelectItem>
              <SelectItem value="sale">Sale</SelectItem>
              <SelectItem value="return_in">Return In</SelectItem>
              <SelectItem value="return_out">Return Out</SelectItem>
              <SelectItem value="adjustment">Adjustment</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ExportBar filename="stock-movements" headers={["Date", "Product", "Type", "Qty", "Unit Cost"]} rows={exportRows} />
      </div>
      <Card><CardContent className="p-0">
        {loading ? <Empty msg="Loading..." /> : rows.length === 0 ? <Empty /> : (
          <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead>Type</TableHead><TableHead>Qty</TableHead><TableHead>Cost</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((r) => {
              const row = r as { id: string; created_at: string; type: string; quantity: number; products?: { name?: string } | null; unit_cost: number };
              return (
                <TableRow key={row.id}>
                  <TableCell className="text-xs">{new Date(row.created_at).toLocaleString()}</TableCell>
                  <TableCell>{row.products?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{row.type}</Badge></TableCell>
                  <TableCell className={row.quantity > 0 ? "text-green-600" : "text-red-600"}>{row.quantity > 0 ? "+" : ""}{row.quantity}</TableCell>
                  <TableCell>{fmt(Number(row.unit_cost))}</TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}

function SuppliersTab() {
  const fnList = useServerFn(listSuppliers);
  const fnSave = useServerFn(upsertSupplier);
  const fnDel = useServerFn(deleteSupplier);
  const [reload, setReload] = useState(0);
  const { rows, loading } = useList(() => fnList(), [reload]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ id?: string; name: string; phone: string; email: string; address: string; contact_person: string; opening_balance: number }>(
    { name: "", phone: "", email: "", address: "", contact_person: "", opening_balance: 0 },
  );
  const reset = () => setForm({ name: "", phone: "", email: "", address: "", contact_person: "", opening_balance: 0 });
  const save = async () => {
    try {
      await fnSave({ data: { ...form, status: "active" } });
      toast.success("Saved"); setOpen(false); reset(); setReload((x) => x + 1);
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="space-y-3 mt-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={reset}><Plus className="h-4 w-4" /> Add Supplier</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit" : "New"} Supplier</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
              <div><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div><Label>Opening Balance (due)</Label><Input type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })} /></div>
            </div>
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        {loading ? <Empty msg="Loading..." /> : rows.length === 0 ? <Empty msg="No suppliers yet" /> : (
          <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Contact</TableHead><TableHead>Opening</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.phone ?? "—"}</TableCell>
                <TableCell>{r.contact_person ?? "—"}</TableCell>
                <TableCell>{fmt(Number(r.opening_balance ?? 0))}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => { setForm({ id: r.id, name: r.name, phone: r.phone ?? "", email: r.email ?? "", address: r.address ?? "", contact_person: r.contact_person ?? "", opening_balance: Number(r.opening_balance ?? 0) }); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={async () => { if (confirm("Delete?")) { try { await fnDel({ data: { id: r.id } }); toast.success("Deleted"); setReload((x) => x + 1); } catch (e) { toast.error((e as Error).message); } } }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}

function PurchasesTab() {
  const fnList = useServerFn(listPurchases);
  const fnDetail = useServerFn(getPurchaseDetail);
  const [reload, setReload] = useState(0);
  const { rows, loading } = useList(() => fnList({ data: {} }), [reload]);
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getPurchaseDetail>> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!detailId) { setDetail(null); return; }
    setDetailLoading(true);
    fnDetail({ data: { id: detailId } })
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [detailId, fnDetail]);

  const exportRows = rows.map((r) => {
    const row = r as { purchase_number: string | null; purchase_date: string; suppliers?: { name?: string } | null; total_amount: number; paid_amount: number; due_amount: number };
    return [row.purchase_number ?? "—", row.purchase_date, row.suppliers?.name ?? "—", fmt(Number(row.total_amount)), fmt(Number(row.paid_amount)), fmt(Number(row.due_amount))];
  });

  const p = detail?.purchase as (null | { purchase_number: string | null; purchase_date: string; status: string; note: string | null; subtotal: number; discount: number; total_amount: number; paid_amount: number; due_amount: number; suppliers?: { name?: string; phone?: string } | null; warehouses?: { name?: string } | null });
  const items = (detail?.items ?? []) as Array<{ id: string; quantity: number; unit_cost: number; total_cost: number; products?: { name?: string; sku?: string } | null }>;
  const payments = (detail?.payments ?? []) as Array<{ id: string; paid_on: string; amount: number; method: string | null; note: string | null }>;

  return (
    <div className="space-y-3 mt-4">
      <div className="flex justify-between">
        <ExportBar filename="purchases" headers={["No", "Date", "Supplier", "Total", "Paid", "Due"]} rows={exportRows} />
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New Purchase</Button>
      </div>
      <Card><CardContent className="p-0">
        {loading ? <Empty msg="Loading..." /> : rows.length === 0 ? <Empty msg="No purchases yet" /> : (
          <Table><TableHeader><TableRow><TableHead>No</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Due</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{rows.map((r) => {
              const row = r as { id: string; purchase_number: string | null; purchase_date: string; suppliers?: { name?: string } | null; total_amount: number; paid_amount: number; due_amount: number };
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.purchase_number ?? "—"}</TableCell>
                  <TableCell>{row.purchase_date}</TableCell>
                  <TableCell>{row.suppliers?.name ?? "—"}</TableCell>
                  <TableCell>{fmt(Number(row.total_amount))}</TableCell>
                  <TableCell className="text-green-600">{fmt(Number(row.paid_amount))}</TableCell>
                  <TableCell className={Number(row.due_amount) > 0 ? "text-red-600 font-medium" : ""}>{fmt(Number(row.due_amount))}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => setDetailId(row.id)}><Eye className="h-4 w-4" /> View</Button></TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table>
        )}
      </CardContent></Card>

      <QuickRestockDialog open={open} onOpenChange={setOpen} onCreated={() => setReload((x) => x + 1)} />

      <Dialog open={!!detailId} onOpenChange={(v) => { if (!v) setDetailId(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Purchase #{p?.purchase_number ?? "—"}</DialogTitle>
          </DialogHeader>
          {detailLoading || !p ? <Empty msg="Loading..." /> : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><p className="text-muted-foreground text-xs">Date</p><p>{p.purchase_date}</p></div>
                <div><p className="text-muted-foreground text-xs">Supplier</p><p>{p.suppliers?.name ?? "—"}</p></div>
                <div><p className="text-muted-foreground text-xs">Warehouse</p><p>{p.warehouses?.name ?? "—"}</p></div>
                <div><p className="text-muted-foreground text-xs">Status</p><Badge variant="outline">{p.status}</Badge></div>
              </div>
              {p.note && <div className="text-sm"><span className="text-muted-foreground">Note: </span>{p.note}</div>}

              <div>
                <p className="font-medium mb-2">Items ({items.length})</p>
                <Table>
                  <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead>Qty</TableHead><TableHead>Unit Cost</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>{items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>{it.products?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{it.products?.sku ?? "—"}</TableCell>
                      <TableCell>{it.quantity}</TableCell>
                      <TableCell>{fmt(Number(it.unit_cost))}</TableCell>
                      <TableCell className="text-right">{fmt(Number(it.total_cost))}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm border-t pt-3">
                <div><p className="text-muted-foreground text-xs">Subtotal</p><p className="font-medium">{fmt(Number(p.subtotal))}</p></div>
                <div><p className="text-muted-foreground text-xs">Discount</p><p>{fmt(Number(p.discount))}</p></div>
                <div><p className="text-muted-foreground text-xs">Total</p><p className="font-bold">{fmt(Number(p.total_amount))}</p></div>
                <div><p className="text-muted-foreground text-xs">Paid</p><p className="text-green-600 font-medium">{fmt(Number(p.paid_amount))}</p></div>
                <div><p className="text-muted-foreground text-xs">Due</p><p className={Number(p.due_amount) > 0 ? "text-red-600 font-bold" : ""}>{fmt(Number(p.due_amount))}</p></div>
              </div>

              <div>
                <p className="font-medium mb-2">Payments ({payments.length})</p>
                {payments.length === 0 ? <Empty msg="No payments yet" /> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead>Note</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>{payments.map((pay) => (
                      <TableRow key={pay.id}>
                        <TableCell>{pay.paid_on}</TableCell>
                        <TableCell>{pay.method ?? "—"}</TableCell>
                        <TableCell className="text-xs">{pay.note ?? "—"}</TableCell>
                        <TableCell className="text-right text-green-600">{fmt(Number(pay.amount))}</TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


function DuesTab() {
  const fn = useServerFn(getSupplierDues);
  const fnPay = useServerFn(recordSupplierPayment);
  const [reload, setReload] = useState(0);
  const { rows, loading } = useList(() => fn(), [reload]);
  const [payOpen, setPayOpen] = useState(false);
  const [paySupplier, setPaySupplier] = useState<{ id: string; name: string } | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const exportRows = rows.map((r) => [r.name, r.phone ?? "", fmt(r.total_purchases), fmt(r.total_paid), fmt(r.due)]);
  return (
    <div className="space-y-3 mt-4">
      <div className="flex justify-end"><ExportBar filename="supplier-dues" headers={["Supplier", "Phone", "Purchases", "Paid", "Due"]} rows={exportRows} /></div>
      <Card><CardContent className="p-0">
        {loading ? <Empty msg="Loading..." /> : rows.length === 0 ? <Empty /> : (
          <Table><TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead>Purchases</TableHead><TableHead>Paid</TableHead><TableHead>Due</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell>{fmt(r.total_purchases)}</TableCell>
                <TableCell className="text-green-600">{fmt(r.total_paid)}</TableCell>
                <TableCell className={r.due > 0 ? "text-red-600 font-bold" : ""}>{fmt(r.due)}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => { setPaySupplier({ id: r.id, name: r.name }); setPayAmount(r.due); setPayOpen(true); }}>Record Payment</Button></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </CardContent></Card>
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pay {paySupplier?.name}</DialogTitle></DialogHeader>
          <div><Label>Amount</Label><Input type="number" value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} /></div>
          <DialogFooter><Button onClick={async () => {
            if (!paySupplier) return;
            try { await fnPay({ data: { supplier_id: paySupplier.id, amount: payAmount } }); toast.success("Paid"); setPayOpen(false); setReload((x) => x + 1); }
            catch (e) { toast.error((e as Error).message); }
          }}>Pay</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReturnsTab() {
  const fnList = useServerFn(listSupplierReturns);
  const fnCreate = useServerFn(createSupplierReturn);
  const fnSup = useServerFn(listSuppliers);
  const fnPurchases = useServerFn(listSupplierPurchasesForReturn);
  const [reload, setReload] = useState(0);
  const { rows, loading } = useList(() => fnList({ data: {} }), [reload]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; cost_price: number | null }>>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ supplier_id: "", purchase_id: "", product_id: "", quantity: 1, unit_cost: 0, amount: 0, amount_edited: false, reason: "" });
  const [supPurchases, setSupPurchases] = useState<{
    purchases: Array<{ id: string; purchase_number: string | null; purchase_date: string; total_amount: number; due_amount: number }>;
    items: Array<{ purchase_id: string; product_id: string; variant_id: string | null; quantity: number; unit_cost: number; products?: { name?: string } | null }>;
  }>({ purchases: [], items: [] });

  useEffect(() => { fnSup().then(setSuppliers).catch(() => setSuppliers([])); }, [fnSup]);
  useEffect(() => {
    import("@/integrations/supabase/client").then(({ supabase }) =>
      supabase.from("products").select("id, name, cost_price").order("name").then((res) => setProducts(res.data ?? [])),
    );
  }, []);

  // When supplier changes → load their purchases for selection
  useEffect(() => {
    if (!form.supplier_id) { setSupPurchases({ purchases: [], items: [] }); return; }
    fnPurchases({ data: { supplier_id: form.supplier_id } }).then(setSupPurchases).catch(() => setSupPurchases({ purchases: [], items: [] }));
  }, [form.supplier_id, fnPurchases]);

  // When product (or purchase) changes → auto-fill unit_cost
  useEffect(() => {
    if (!form.product_id) return;
    if (form.purchase_id) {
      const it = supPurchases.items.find((i) => i.purchase_id === form.purchase_id && i.product_id === form.product_id);
      if (it) { setForm((f) => ({ ...f, unit_cost: Number(it.unit_cost) })); return; }
    }
    const p = products.find((p) => p.id === form.product_id);
    if (p) setForm((f) => ({ ...f, unit_cost: Number(p.cost_price ?? 0) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.product_id, form.purchase_id]);

  const productOptions = useMemo(() => {
    if (form.purchase_id) {
      const items = supPurchases.items.filter((i) => i.purchase_id === form.purchase_id);
      return items.map((i) => ({ id: i.product_id, name: i.products?.name ?? "—" }));
    }
    return products.map((p) => ({ id: p.id, name: p.name }));
  }, [form.purchase_id, supPurchases.items, products]);

  const exportRows = rows.map((r) => {
    const row = r as { return_date: string; suppliers?: { name?: string } | null; products?: { name?: string } | null; quantity: number; unit_cost: number; reason: string | null };
    return [row.return_date, row.suppliers?.name ?? "—", row.products?.name ?? "—", row.quantity, Number(row.unit_cost), row.quantity * Number(row.unit_cost), row.reason ?? ""];
  });

  const resetForm = () => setForm({ supplier_id: "", purchase_id: "", product_id: "", quantity: 1, unit_cost: 0, amount: 0, amount_edited: false, reason: "" });

  // Auto-sync amount from qty * unit_cost unless user manually edited amount
  useEffect(() => {
    if (form.amount_edited) return;
    setForm((f) => ({ ...f, amount: Number((f.quantity * f.unit_cost).toFixed(2)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.quantity, form.unit_cost]);

  return (
    <div className="space-y-3 mt-4">
      <div className="flex justify-between">
        <ExportBar filename="supplier-returns" headers={["Date", "Supplier", "Product", "Qty", "Unit Cost", "Refund", "Reason"]} rows={exportRows} />
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> New Return</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Supplier Return</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Supplier</Label>
                <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v, purchase_id: "", product_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {form.supplier_id && supPurchases.purchases.length > 0 && (
                <div><Label>Linked Purchase (optional)</Label>
                  <Select value={form.purchase_id || "__none"} onValueChange={(v) => setForm({ ...form, purchase_id: v === "__none" ? "" : v, product_id: "" })}>
                    <SelectTrigger><SelectValue placeholder="No link" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— No purchase link —</SelectItem>
                      {supPurchases.purchases.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.purchase_number ?? p.id.slice(0, 6)} · {p.purchase_date} · Due {fmt(Number(p.due_amount))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Product</Label>
                <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{productOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value), amount_edited: false })} /></div>
                <div><Label>Unit Cost</Label><Input type="number" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value), amount_edited: false })} /></div>
              </div>
              <div>
                <Label>Amount (editable)</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value), amount_edited: true })} />
                {form.purchase_id && <p className="text-xs text-muted-foreground mt-1">এই amount দ্বারা supplier due কমবে</p>}
              </div>
              <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={async () => {
              if (!form.supplier_id || !form.product_id) { toast.error("Supplier and product required"); return; }
              const qty = form.quantity || 0;
              const effectiveUnitCost = qty > 0 ? Number((form.amount / qty).toFixed(4)) : form.unit_cost;
              try {
                await fnCreate({ data: {
                  supplier_id: form.supplier_id,
                  purchase_id: form.purchase_id || undefined,
                  product_id: form.product_id,
                  quantity: form.quantity,
                  unit_cost: effectiveUnitCost,
                  reason: form.reason || undefined,
                } });
                toast.success("Return recorded");
                setOpen(false); resetForm(); setReload((x) => x + 1);
              } catch (e) { toast.error((e as Error).message); }
            }}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        {loading ? <Empty msg="Loading..." /> : rows.length === 0 ? <Empty msg="No returns yet" /> : (
          <Table><TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead>Product</TableHead>
            <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit Cost</TableHead>
            <TableHead className="text-right">Refund</TableHead><TableHead>Reason</TableHead>
          </TableRow></TableHeader>
            <TableBody>{rows.map((r) => {
              const row = r as { id: string; return_date: string; suppliers?: { name?: string } | null; products?: { name?: string } | null; quantity: number; unit_cost: number; reason: string | null };
              const refund = row.quantity * Number(row.unit_cost);
              return (
                <TableRow key={row.id}>
                  <TableCell>{row.return_date}</TableCell>
                  <TableCell>{row.suppliers?.name ?? "—"}</TableCell>
                  <TableCell>{row.products?.name ?? "—"}</TableCell>
                  <TableCell className="text-right">{row.quantity}</TableCell>
                  <TableCell className="text-right">{fmt(Number(row.unit_cost))}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(refund)}</TableCell>
                  <TableCell className="text-xs">{row.reason ?? "—"}</TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}

function WarehousesTab() {
  const fnList = useServerFn(listWarehouses);
  const fnSave = useServerFn(upsertWarehouse);
  const fnDel = useServerFn(deleteWarehouse);
  const [reload, setReload] = useState(0);
  const { rows, loading } = useList(() => fnList(), [reload]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ id?: string; name: string; location: string; is_default: boolean; status: "active" | "inactive" }>({ name: "", location: "", is_default: false, status: "active" });

  const openNew = () => { setForm({ name: "", location: "", is_default: false, status: "active" }); setOpen(true); };
  const openEdit = (r: { id: string; name: string; location: string | null; is_default: boolean; status: "active" | "inactive" }) => {
    setForm({ id: r.id, name: r.name, location: r.location ?? "", is_default: r.is_default, status: r.status });
    setOpen(true);
  };

  return (
    <div className="space-y-3 mt-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{rows.length} warehouse(s)</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4" /> Add Warehouse</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit Warehouse" : "New Warehouse"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} /> Default warehouse</label>
            </div>
            <DialogFooter><Button onClick={async () => {
              try { await fnSave({ data: form }); toast.success("Saved"); setOpen(false); setReload((x) => x + 1); }
              catch (e) { toast.error((e as Error).message); }
            }}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        {loading ? <Empty msg="Loading..." /> : rows.length === 0 ? <Empty /> : (
          <Table><TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead>Default</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
            <TableBody>{rows.map((r) => {
              const row = r as { id: string; name: string; location: string | null; is_default: boolean; status: "active" | "inactive" };
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.location ?? "—"}</TableCell>
                  <TableCell>{row.status === "active" ? <Badge variant="default">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                  <TableCell>{row.is_default ? <Badge>Default</Badge> : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={async () => {
                      if (!confirm(`Delete warehouse "${row.name}"?`)) return;
                      try { await fnDel({ data: { id: row.id } }); toast.success("Deleted"); setReload((x) => x + 1); }
                      catch (e) { toast.error((e as Error).message); }
                    }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}

