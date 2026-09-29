import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ApiResponse } from "../types";

// The three measurement labels, in the order the brief lists them.
const LABELS = ["Temperature (ºC)", "Pressure (hpa)", "Speed (m/s)"];

interface Series {
  key: string;
  color: string;
  width: number;
}

/**
 * One chart per measurement, each with its own auto-scaled Y axis.
 * Mixing measurements with very different units (°C vs hPa) on a single axis
 * hides the variation, so we render small multiples instead. For aggregated
 * queries we also draw the min/max lines, which is what the wind-farm analysis
 * really cares about (extremes).
 */
export function ResultsChart({ result }: { result: ApiResponse }) {
  const rows = result.data;
  if (!rows.length) return null;

  const first = rows[0];
  const isAggregated = result.aggregation !== "None";
  const present = LABELS.filter((label) =>
    Object.keys(first).some((k) => k === label || k.startsWith(`${label} `))
  );

  return (
    <div className="charts">
      {present.map((label) => {
        const series: Series[] = isAggregated
          ? [
              { key: `${label} mean`, color: "#0e7490", width: 2 },
              { key: `${label} min`, color: "#94a3b8", width: 1 },
              { key: `${label} max`, color: "#94a3b8", width: 1 },
            ].filter((s) => s.key in first)
          : [{ key: label, color: "#0e7490", width: 2 }];

        return (
          <div className="chart-block" key={label}>
            <h4 className="chart-title">{label}</h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={rows} margin={{ top: 6, right: 24, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis
                  dataKey="Datetime"
                  tickFormatter={(v: string) => v.slice(5, 16)}
                  minTickGap={48}
                  fontSize={11}
                />
                <YAxis domain={["auto", "auto"]} width={52} fontSize={11} />
                <Tooltip />
                <Legend />
                {series.map((s) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={s.width} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}
