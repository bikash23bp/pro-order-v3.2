import { lazy, Suspense } from "react";

const Inner = lazy(async () => {
  const {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
    PieChart, Pie, Cell, Legend,
  } = await import("recharts");

  function IncomeVsExpenseChart({ data }: { data: any[] }) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="day" className="text-xs" />
          <YAxis className="text-xs" />
          <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6 }} />
          <Legend />
          <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  function StatusPieChart({ data, colors }: { data: any[]; colors: Record<string, string> }) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
            {data.map((s) => (
              <Cell key={s.name} fill={colors[s.name] ?? "#94a3b8"} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6 }} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  function ReportsChartsImpl(props: {
    variant: "income-vs-expense" | "status-pie";
    data: any[];
    colors?: Record<string, string>;
  }) {
    if (props.variant === "income-vs-expense") return <IncomeVsExpenseChart data={props.data} />;
    return <StatusPieChart data={props.data} colors={props.colors ?? {}} />;
  }

  return { default: ReportsChartsImpl };
});

function Fallback() {
  return <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">Loading chart…</div>;
}

export function ReportsChart(props: {
  variant: "income-vs-expense" | "status-pie";
  data: any[];
  colors?: Record<string, string>;
}) {
  return (
    <Suspense fallback={<Fallback />}>
      <Inner {...props} />
    </Suspense>
  );
}
