import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getOmsPartnerReport } from "@/lib/oms-partner-report.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

type Props = { from: string; to: string };

export function PartnerOrdersReport({ from, to }: Props) {
  const reportFn = useServerFn(getOmsPartnerReport);
  const { data, isLoading, error } = useQuery({
    queryKey: ["oms-partner-report", from, to],
    queryFn: () => reportFn({ data: { from, to } }),
  });

  const rows = data ?? [];
  const totalCount = rows.reduce((s, r) => s + r.total_count, 0);
  const totalAmount = rows.reduce((s, r) => s + r.total_amount, 0);

  // Collect unique statuses across all partners for column headers
  const statusSet = new Set<string>();
  for (const r of rows) for (const s of Object.keys(r.by_status)) statusSet.add(s);
  const statuses = Array.from(statusSet).sort();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders by OMS Partner</CardTitle>
        <CardDescription>
          কোন পাটনার OMS হতে কত অর্ডার এসেছে — সময়সীমা অনুযায়ী।
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <div className="text-sm text-rose-500">Failed to load: {error instanceof Error ? error.message : "Unknown error"}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">এই সময়ে কোনো পাটনার অর্ডার নেই।</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner (OMS)</TableHead>
                  <TableHead className="text-right">Total Orders</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  {statuses.map((s) => (
                    <TableHead key={s} className="text-right capitalize">{s.replace(/_/g, " ")}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.sender_name}>
                    <TableCell className="font-medium">
                      <Badge variant="secondary">{r.sender_name}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.total_count}</TableCell>
                    <TableCell className="text-right tabular-nums">৳ {r.total_amount.toFixed(2)}</TableCell>
                    {statuses.map((s) => (
                      <TableCell key={s} className="text-right tabular-nums">
                        {r.by_status[s]?.count ?? 0}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{totalCount}</TableCell>
                  <TableCell className="text-right tabular-nums">৳ {totalAmount.toFixed(2)}</TableCell>
                  {statuses.map((s) => (
                    <TableCell key={s} className="text-right tabular-nums">
                      {rows.reduce((acc, r) => acc + (r.by_status[s]?.count ?? 0), 0)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
