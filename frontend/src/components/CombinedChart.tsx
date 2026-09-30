import {
  Brush, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { DataRow } from "../types";

interface AxisConfig {
  axis: string;
  color: string;
  orientation: "left" | "right";
  hidden?: boolean;
}

// Wind (m/s) is the primary metric on the left; temperature on the right; pressure
// on a hidden right axis (its exact value is always in the unified tooltip).
const AXES: Record<string, AxisConfig> = {
  "Speed (m/s)": { axis: "wind", color: "#0e7490", orientation: "left" },
  "Temperature (ºC)": { axis: "temp", color: "#f97316", orientation: "right" },
  "Pressure (hpa)": { axis: "pres", color: "#2563eb", orientation: "right", hidden: true },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isoParts(iso: string) {
  const [datePart, rest] = String(iso).split("T");
  const [, m, d] = datePart.split("-").map(Number);
  return { m, d, time: rest ? rest.slice(0, 5) : "" };
}
const fmtDate = (iso: string) => { const p = isoParts(iso); return `${p.d} ${MONTHS[p.m - 1]}`; };
const fmtDateTime = (iso: string) => { const p = isoParts(iso); return `${p.d} ${MONTHS[p.m - 1]}, ${p.time}`; };

function unitOf(label: string): string {
  const m = label.match(/\(([^)]+)\)/);
  return m ? m[1] : "";
}
function nameOf(key: string): string {
  return key.replace(/\s+mean$/, "").replace(/\s*\(.*\)/, "");
}

function CombinedTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const station = payload[0]?.payload?.Station as string | undefined;
  return (
    <div className="ctip">
      <div className="ctip-time">{fmtDateTime(String(label))}</div>
      {station && <div className="ctip-station">{station}</div>}
      {payload.map((p: any) => (
        <div className="ctip-row" key={p.dataKey}>
          <span className="ctip-dot" style={{ background: p.color }} />
          <span className="ctip-name">{nameOf(String(p.dataKey))}</span>
          <span className="ctip-val">{p.value}{unitOf(String(p.dataKey))}</span>
        </div>
      ))}
    </div>
  );
}

/** Correlation chart: measurements together on secondary Y axes, unified tooltip and
 *  a range selector (drag to zoom into a period, drag the middle to pan). */
export function CombinedChart({ rows, labels, aggregated, height = 280 }: { rows: DataRow[]; labels: string[]; aggregated: boolean; height?: number }) {
  const items = labels
    .filter((label) => AXES[label])
    .map((label) => ({ label, key: aggregated ? `${label} mean` : label, ...AXES[label] }))
    .filter((it) => it.key in (rows[0] ?? {}));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
        <XAxis dataKey="Datetime" tickFormatter={fmtDate} minTickGap={48} fontSize={11} />
        {items.map((it) => (
          <YAxis key={it.axis} yAxisId={it.axis} orientation={it.orientation} hide={it.hidden} width={44} fontSize={11} domain={["auto", "auto"]} />
        ))}
        <Tooltip content={<CombinedTooltip />} />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        {items.map((it) => (
          <Line
            key={it.key}
            yAxisId={it.axis}
            type="monotone"
            dataKey={it.key}
            name={nameOf(it.key)}
            stroke={it.color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
        <Brush dataKey="Datetime" height={22} stroke="#94a3b8" travellerWidth={8} tickFormatter={fmtDate} />
      </LineChart>
    </ResponsiveContainer>
  );
}
