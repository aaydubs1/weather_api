import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export interface EconPoint {
  Datetime: string;  // day (YYYY-MM-DDT00:00:00)
  dayKwh: number;
  dayDiesel: number;
  dayCost: number;
  dayCo2: number;
  cumCost: number;   // cumulative cost avoided (€)
  cumDiesel: number;
  cumKwh: number;
  cumCo2: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const f0 = (x: number) => Math.round(x).toLocaleString();

function makeFmt(granularity: "day" | "month") {
  return (iso: string) => {
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    return granularity === "month" ? `${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`;
  };
}

function Tip({ active, payload, fmt, unitLabel }: any) {
  if (!active || !payload?.length) return null;
  const p: EconPoint = payload[0].payload;
  return (
    <div className="ctip">
      <div className="ctip-time">{fmt(p.Datetime)}</div>
      <div className="ctip-row"><span className="ctip-dot" style={{ background: "#60c5f1" }} /><span className="ctip-name">This {unitLabel}</span><span className="ctip-val">€{f0(p.dayCost)}</span></div>
      <div className="ctip-row" style={{ color: "#64748b" }}><span className="ctip-name">· energy / diesel / CO₂</span><span className="ctip-val">{f0(p.dayKwh)} kWh · {f0(p.dayDiesel)} L · {f0(p.dayCo2)} kg</span></div>
      <div className="ctip-row"><span className="ctip-dot" style={{ background: "#0e7490" }} /><span className="ctip-name">Cumulative</span><span className="ctip-val">€{f0(p.cumCost)}</span></div>
    </div>
  );
}

/** Per-period bars (cost avoided each day or month) + the cumulative line over the period.
 *  Works for any aggregation: the caller buckets by day, except Monthly, which buckets by month. */
export function EconomicsChart({ data, granularity = "day" }: { data: EconPoint[]; granularity?: "day" | "month" }) {
  const fmt = makeFmt(granularity);
  const unitLabel = granularity === "month" ? "month" : "day";
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid vertical={false} stroke="#eef2f7" />
        <XAxis dataKey="Datetime" tickFormatter={fmt} minTickGap={40} fontSize={11} tickLine={false} axisLine={false} />
        <YAxis yAxisId="day" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `€${f0(v)}`} />
        <YAxis yAxisId="cum" orientation="right" fontSize={11} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => `€${f0(v)}`} />
        <Tooltip content={<Tip fmt={fmt} unitLabel={unitLabel} />} />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="day" dataKey="dayCost" name={`Per ${unitLabel}`} fill="#60c5f1" radius={[2, 2, 0, 0]} isAnimationActive={false} />
        <Line yAxisId="cum" dataKey="cumCost" name="Cumulative" type="monotone" stroke="#0e7490" strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
