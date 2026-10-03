import {
  CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from "recharts";
import { CUT_IN, CUT_OUT } from "../feasibility";

export interface ScatterPoint { wind: number; temp: number; when: string; rh?: number | null; }
export interface ScatterGroup { name: string; color: string; points: ScatterPoint[]; }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtWhen(iso: string) {
  const [date, rest] = String(iso).split("T");
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${rest ? `, ${rest.slice(0, 5)}` : ""}`;
}

function Tip({ active, payload, opTempMin }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as ScatterPoint;
  const hasRh = typeof p.rh === "number";
  const icing = p.temp < 0 && hasRh && (p.rh as number) > 90;
  // Explain the colour: why a sub-zero point may still count as "generating".
  let note: string | null = null;
  if (p.temp < opTempMin) note = "Below the −10 °C cold limit → stopped";
  else if (icing) note = "Sub-zero and humid (RH > 90%) → icing risk, stopped";
  else if (p.temp < 0) note = hasRh ? "Sub-zero but dry (RH ≤ 90%) → no icing" : "Sub-zero (humidity not reported)";
  return (
    <div className="ctip">
      <div className="ctip-time">{fmtWhen(p.when)}</div>
      <div className="ctip-row"><span className="ctip-name">Wind</span><span className="ctip-val">{p.wind.toFixed(1)} m/s</span></div>
      <div className="ctip-row"><span className="ctip-name">Temp</span><span className="ctip-val">{p.temp.toFixed(1)} °C</span></div>
      {hasRh && <div className="ctip-row"><span className="ctip-name">Humidity</span><span className="ctip-val">{Math.round(p.rh as number)} %</span></div>}
      {note && <div className="ctip-extra">{note}</div>}
    </div>
  );
}

/** Each dot is a reading placed by its wind speed (x) and temperature (y); the dashed lines
 *  are the turbine thresholds. You can see which readings fall in the operating window and
 *  which don't — this is where the operating-state percentages come from. */
export function ThresholdScatter({ groups, opTempMin }: { groups: ScatterGroup[]; opTempMin: number }) {
  return (
    <ResponsiveContainer width="100%" height={316}>
      <ScatterChart margin={{ top: 8, right: 20, bottom: 24, left: 0 }}>
        <CartesianGrid stroke="#eef2f7" />
        {/* Legend on top so it never collides with the x-axis title at the bottom. */}
        <Legend iconSize={9} verticalAlign="top" align="center" wrapperStyle={{ fontSize: 11, paddingBottom: 10 }} />
        <XAxis type="number" dataKey="wind" name="Wind" unit=" m/s" domain={[0, "dataMax"]} fontSize={11} tickLine={false} axisLine={false} height={38}
          label={{ value: "Wind speed (m/s)", position: "insideBottom", offset: -2, fontSize: 11, fill: "#64748b" }} />
        <YAxis type="number" dataKey="temp" name="Temp" unit="°C" fontSize={11} tickLine={false} axisLine={false} width={44}
          label={{ value: "Temp (°C)", angle: -90, position: "insideLeft", fontSize: 11, fill: "#64748b" }} />
        <ReferenceLine x={CUT_IN} stroke="#94a3b8" strokeDasharray="4 3" label={{ value: `cut-in ${CUT_IN}`, fontSize: 10, fill: "#64748b", position: "top" }} />
        <ReferenceLine x={CUT_OUT} stroke="#94a3b8" strokeDasharray="4 3" label={{ value: `cut-out ${CUT_OUT}`, fontSize: 10, fill: "#64748b", position: "top" }} />
        <ReferenceLine y={opTempMin} stroke="#94a3b8" strokeDasharray="4 3" label={{ value: `cold limit ${opTempMin}°C`, fontSize: 10, fill: "#64748b", position: "right" }} />
        <ReferenceLine y={0} stroke="#cbd5e1" label={{ value: "freezing 0°C", fontSize: 10, fill: "#94a3b8", position: "right" }} />
        <Tooltip content={<Tip opTempMin={opTempMin} />} cursor={{ strokeDasharray: "3 3" }} />
        {groups.map((g) => (
          <Scatter key={g.name} name={g.name} data={g.points} fill={g.color} fillOpacity={0.6} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
