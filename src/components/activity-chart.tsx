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

export interface ActivityChartPoint {
  date: string;
  token: number;
  nft: number;
  defi: number;
  other: number;
}

export function ActivityChart({ data }: { data: ActivityChartPoint[] }) {
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
        <Bar dataKey="token" name="토큰" stackId="activity" fill="#6d9dcd" />
        <Bar dataKey="nft" name="NFT" stackId="activity" fill="#cf9a55" />
        <Bar dataKey="defi" name="DeFi" stackId="activity" fill="#879a67" />
        <Bar dataKey="other" name="기타" stackId="activity" fill="#82718b" />
      </BarChart>
    </ResponsiveContainer>
  );
}
