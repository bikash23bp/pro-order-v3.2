import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Package } from "lucide-react";

type MotherRow = {
  id: string;
  name: string;
  unit: string | null;
  stock: number;
  low_stock_threshold: number;
  image_url: string | null;
  consumed: number;
  by_sub: Array<{ sub_id: string; sub_name: string; consumed: number }>;
};

export function MotherProductsReport({ from, to }: { from: string; to: string }) {
  const q = useQuery({
    queryKey: ["mother-products-report", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_mother_products_report", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      const payload = (data ?? {}) as { mothers?: MotherRow[] };
      return payload.mothers ?? [];
    },
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return <div className="h-40 rounded-md border bg-muted/20 animate-pulse" />;
  }
  if (q.error) {
    return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  }
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mother Products</CardTitle>
          <CardDescription>কোনো মাদার প্রডাক্ট পাওয়া যায়নি। প্রডাক্ট এডিট করে "Mother product" চালু করুন।</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Mother Products — Stock & Consumption</CardTitle>
          <CardDescription>
            নির্বাচিত date range-এ প্রতিটি মাদার প্রডাক্ট থেকে কতটুকু (unit) sub-product বিক্রির মাধ্যমে কাটা হয়েছে।
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mother Product</TableHead>
                <TableHead className="text-right">Current Stock</TableHead>
                <TableHead className="text-right">Consumed in range</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => {
                const low = Number(m.stock) <= Number(m.low_stock_threshold ?? 0);
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-md bg-muted grid place-items-center overflow-hidden">
                          {m.image_url
                            ? <img src={m.image_url} alt={m.name} className="h-full w-full object-cover" loading="lazy" />
                            : <Package className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div>
                          <div className="font-medium">{m.name}</div>
                          {m.unit && <div className="text-xs text-muted-foreground">unit: {m.unit}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(m.stock).toLocaleString()} {m.unit ?? ""}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(m.consumed).toLocaleString()} {m.unit ?? ""}
                    </TableCell>
                    <TableCell>
                      {low
                        ? <Badge variant="destructive">Low stock</Badge>
                        : <Badge variant="secondary">OK</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Per-mother breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rows.map((m) => (
          <Card key={m.id}>
            <CardHeader>
              <CardTitle className="text-base">{m.name}</CardTitle>
              <CardDescription>Sub-product wise consumption</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {m.by_sub.length === 0 ? (
                <p className="px-6 pb-4 text-sm text-muted-foreground">এই range-এ কোনো sub-product বিক্রি হয়নি।</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sub-product</TableHead>
                      <TableHead className="text-right">Consumed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {m.by_sub.map((s) => (
                      <TableRow key={s.sub_id}>
                        <TableCell>{s.sub_name}</TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(s.consumed).toLocaleString()} {m.unit ?? ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
