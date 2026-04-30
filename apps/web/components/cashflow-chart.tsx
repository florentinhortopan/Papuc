"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function CashflowChart({
  monthlyPreTaxProfit,
  height = 200,
}: {
  monthlyPreTaxProfit: number[];
  height?: number;
}) {
  const data = monthlyPreTaxProfit.map((v, i) => ({
    month: MONTHS[i] ?? `M${i}`,
    profit: Math.round(v),
  }));

  return (
    <div className="bg-surfaceAlt border border-border rounded-2xl p-4">
      <p className="text-textMuted text-xs mb-3">Monthly pre-tax profit</p>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#2a2a36" vertical={false} />
          <XAxis
            dataKey="month"
            stroke="#8b8b96"
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#8b8b96"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) =>
              Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
            }
            width={48}
          />
          <Tooltip
            cursor={{ fill: "rgba(124, 92, 255, 0.06)" }}
            contentStyle={{
              background: "#16161d",
              border: "1px solid #2a2a36",
              borderRadius: 12,
              color: "#f5f5f7",
              fontSize: 12,
            }}
            formatter={(value: number) => [
              `$${value.toLocaleString()}`,
              "Profit",
            ]}
          />
          <ReferenceLine y={0} stroke="#2a2a36" />
          <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.profit >= 0 ? "#3ddc97" : "#ff5c7a"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
