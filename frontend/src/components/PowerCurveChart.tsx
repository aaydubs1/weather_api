import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { powerFraction } from "../feasibility";

// The classic wind-resource chart: how often the wind blows at each speed (bars) against
// the turbine power curve (line). Where tall bars meet the rising curve is where the
// energy actually comes from.
const MAX_BIN = 26; // m/s (0..25 + overflow)

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const freq = payload.find((p: any) => p.dataKey === "freq")?.value;
  const power = payload.find((p: any) => p.dataKey === "power")?.value;
  return (
    <div className="ctip">
      <div className="ctip-time">{label}–{Number(label) + 1} m/s</div>
      <div className="ctip-row"><span className="ctip-dot" style={{ background: "#60c5f1" }} /><span className="ctip-name">Frequency</span><span className="ctip-val">{freq}%</span></div>
      <div className="ctip-row"><span className="ctip-dot" style={{ background: "#10b981" }} /><span className="ctip-name">Turbine output</span><span className="ctip-val">{power}%</span></div>
    </div>
  );
}

export function PowerCurveChart({ winds }: { winds: number[] }) {
  const counts = new Array(MAX_BIN).fill(0);
  for (const v of winds) if (v >= 0) counts[Math.min(Math.floor(v), MAX_BIN - 1)]++;
  const total = winds.length || 1;
  const data = counts.map((c, i) => ({
    speed: i,
    freq: +((100 * c) / total).toFixed(2),
    power: Math.round(powerFraction(i) * 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={262}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="#eef2f7" />
        <XAxis dataKey="speed" fontSize={11} tickLine={false} axisLine={false} height={42}
          label={{ value: "Wind speed (m/s)", position: "insideBottom", offset: 2, fontSize: 11, fill: "#64748b" }} />
        <YAxis yAxisId="freq" fontSize={11} tickLine={false} axisLine={false} width={40} unit="%" />
        <YAxis yAxisId="power" orientation="right" domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} width={38} unit="%" />
        <Tooltip content={<Tip />} />
        <Legend verticalAlign="bottom" height={26} iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
        <Bar yAxisId="freq" dataKey="freq" name="Frequency" fill="#60c5f1" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Line yAxisId="power" dataKey="power" name="Turbine output" type="monotone" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
