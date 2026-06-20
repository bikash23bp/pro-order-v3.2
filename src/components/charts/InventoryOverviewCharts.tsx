import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Empty = ({ msg = "কোনো ডেটা নেই" }: { msg?: string }) => (
  <div className="py-12 text-center text-sm text-muted-foreground">{msg}</div>
);

type Purchase = { month: string; total: number };
type Move = { month: string; in: number; out: number };

export default function InventoryOverviewCharts({
  purchases,
  moves,
}: {
  purchases: Purchase[];
  moves: Move[];
}) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Monthly Purchases (12 mo)</CardTitle></CardHeader>
        <CardContent>
          {purchases.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={purchases}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="total" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Stock In vs Out (6 mo)</CardTitle></CardHeader>
        <CardContent>
          {moves.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={moves}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Bar dataKey="in" fill="#22c55e" name="Stock In" />
                <Bar dataKey="out" fill="#ef4444" name="Stock Out" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
