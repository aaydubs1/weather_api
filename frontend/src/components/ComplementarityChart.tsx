import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { DataRow } from "../types";
import { pearson } from "../feasibility";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string) {
  const [, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ctip">
      <div className="ctip-time">{fmtDate(String(label))}</div>
      {payload.map((p: any) => (
        <div className="ctip-row" key={p.dataKey}>
          <span className="ctip-dot" style={{ background: p.color }} />
          <span className="ctip-name">{p.name}</span>
          <span className="ctip-val">{Math.round(p.value)}{p.dataKey.startsWith("Solar") ? " W/m²" : " m/s"}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Wind–Solar complementarity: do the two resources fill each other's gaps? If they are
 * anti-correlated, a hybrid smooths supply and displaces more diesel. Descriptive — the
 * correlation is reported, not turned into a verdict.
 */
export function ComplementarityChart({ rows, aggregated }: { rows: DataRow[]; aggregated: boolean }) {
  const windKey = aggregated ? "Speed (m/s) mean" : "Speed (m/s)";
  const solarKey = "Solar irradiance (W/m²)";

  const w: number[] = [], s: number[] = [];
  for (const r of rows) {
    const a = r[windKey], b = r[solarKey];
    if (typeof a === "number" && typeof b === "number") { w.push(a); s.push(b); }
  }
  const r = pearson(w, s);
  const verdict = r === null
    ? "Not enough overlapping data to compare."
    : r < -0.15 ? "Complementary — solar tends to be strong when wind is weak, so a hybrid smooths supply and displaces more diesel."
    : r > 0.15 ? "They tend to rise and fall together, so a hybrid smooths supply less (but still diversifies it)."
    : "Largely independent — a hybrid still diversifies supply against calm or cloudy spells.";

  return (
    <>
      <div className="compl-head">
        Wind–Solar correlation <b>r = {r === null ? "—" : r.toFixed(2)}</b>
        <span className="compl-verdict">{verdict}</span>
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef2f7" />
          <XAxis dataKey="Datetime" tickFormatter={fmtDate} minTickGap={48} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis yAxisId="wind" fontSize={11} tickLine={false} axisLine={false} width={44} unit=" m/s" />
          <YAxis yAxisId="solar" orientation="right" fontSize={11} tickLine={false} axisLine={false} width={48} />
          <Tooltip content={<Tip />} />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          <Line yAxisId="wind" dataKey={windKey} name="Wind" type="monotone" stroke="#0e7490" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line yAxisId="solar" dataKey={solarKey} name="Solar" type="monotone" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}
