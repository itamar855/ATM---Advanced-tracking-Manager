"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

interface PLChartProps {
  data: Array<{
    date: string;
    revenue: number;
    spend: number;
    profit: number;
  }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload) return null;

  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-lg p-3 shadow-xl">
      <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">{label}</p>
      {payload.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-[var(--color-text-secondary)]">{entry.name}:</span>
            <span className="font-medium text-[var(--color-text-primary)]">
              R$ {Number(entry.value).toLocaleString("pt-BR")}
            </span>
          </div>
        )
      )}
    </div>
  );
}

export function PLChart({ data }: PLChartProps) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Receita vs Gasto vs Lucro
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Últimos 7 dias
          </p>
        </div>
        <div className="flex items-center gap-4">
          <LegendItem color="#8347ff" label="Receita" />
          <LegendItem color="#f59e0b" label="Gasto" />
          <LegendItem color="#10b981" label="Lucro" />
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <defs>
              <linearGradient id="gradientRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8347ff" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#8347ff" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradientSpend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradientProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border-subtle)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Receita"
              stroke="#8347ff"
              strokeWidth={2}
              fill="url(#gradientRevenue)"
            />
            <Area
              type="monotone"
              dataKey="spend"
              name="Gasto"
              stroke="#f59e0b"
              strokeWidth={2}
              fill="url(#gradientSpend)"
            />
            <Area
              type="monotone"
              dataKey="profit"
              name="Lucro"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#gradientProfit)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-[11px] text-[var(--color-text-muted)]">{label}</span>
    </div>
  );
}
