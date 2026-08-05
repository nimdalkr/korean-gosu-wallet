"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SignalChartPoint {
  date: string;
  alpha: number;
  anomaly: number;
  noise: number;
}

export function SignalChart({ data }: { data: SignalChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
      <BarChart data={data} margin={{ top: 16, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid stroke="#272b2f" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "#777e85", fontSize: 11 }}
          axisLine={{ stroke: "#353a3f" }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: "#777e85", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "#15181b",
            border: "1px solid #3a4046",
            color: "#e9ecef",
            fontSize: 12,
          }}
          cursor={{ fill: "rgba(255,255,255,0.035)" }}
        />
        <Bar dataKey="alpha" name="알파" stackId="signal" fill="#42d6a4" />
        <Bar dataKey="anomaly" name="이상 행동" stackId="signal" fill="#f0b65a" />
        <Bar dataKey="noise" name="노이즈" stackId="signal" fill="#687078" />
      </BarChart>
    </ResponsiveContainer>
  );
}
