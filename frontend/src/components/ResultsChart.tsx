import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ApiResponse } from "../types";

const COLORS = ["#0ea5e9", "#f97316", "#16a34a", "#a855f7", "#dc2626", "#0891b2"];

export function ResultsChart({ result }: { result: ApiResponse }) {
  const rows = result.data;
  if (!rows.length) return null;

  const first = rows[0];
  const isAggregated = result.aggregation !== "None";
  const numericKeys = Object.keys(first).filter(
    (k) => k !== "Station" && k !== "Datetime" && k !== "Samples" && typeof first[k] === "number"
  );
  // When aggregated, plot the mean series to keep the chart readable.
  const series = isAggregated ? numericKeys.filter((k) => k.endsWith("mean")) : numericKeys;

  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={rows} margin={{ top: 10, right: 24, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
        <XAxis dataKey="Datetime" tickFormatter={(v: string) => v.slice(5, 16)} minTickGap={48} fontSize={12} />
        <YAxis fontSize={12} width={48} />
        <Tooltip />
        <Legend />
        {series.map((key, i) => (
          <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
