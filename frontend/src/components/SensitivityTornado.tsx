import {
  Bar, CartesianGrid, Cell, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export interface TornadoRow {
  factor: string;    // e.g. "Diesel price"
  minus: number;     // output when the input is −swing%
  plus: number;      // output when the input is +swing%
}

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "—");

function Tip({ active, payload, unit, base, swing }: any) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload as TornadoRow;
  return (
    <div className="ctip">
      <div className="ctip-time">{r.factor}</div>
      <div className="ctip-row"><span className="ctip-name">−{swing}%</span><span className="ctip-val">{f1(r.minus)} {unit}</span></div>
      <div className="ctip-row"><span className="ctip-name">+{swing}%</span><span className="ctip-val">{f1(r.plus)} {unit}</span></div>
      <div className="ctip-row" style={{ color: "#64748b" }}><span className="ctip-name">base</span><span className="ctip-val">{f1(base)} {unit}</span></div>
    </div>
  );
}

/**
 * Tornado chart: for each uncertain input, a floating bar spanning the output's range when
 * that input is varied ±`swing`% (everything else held at base). The reference line marks the
 * base case. Longer bars = the inputs the decision is most sensitive to — the standard
 * "risk / sensitivity" view in feasibility tools. Built with the transparent-offset trick
 * (an invisible bar to the low end, then a visible span).
 */
export function SensitivityTornado({
  data, base, unit, swing = 30,
}: { data: TornadoRow[]; base: number; unit: string; swing?: number }) {
  const rows = data
    .map((d) => {
      const low = Math.min(d.minus, d.plus);
      const high = Math.max(d.minus, d.plus);
      return { ...d, low, high, offset: low, span: high - low };
    })
    // widest swing at the top — the tornado shape
    .sort((a, b) => a.span - b.span);

  const maxV = Math.max(base, ...rows.map((r) => r.high)) * 1.08;

  return (
    <ResponsiveContainer width="100%" height={Math.max(150, rows.length * 46 + 46)}>
      <ComposedChart data={rows} layout="vertical" margin={{ top: 6, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid horizontal={false} stroke="#eef2f7" />
        <XAxis type="number" domain={[0, maxV]} fontSize={11} tickLine={false} axisLine={false}
          tickFormatter={(v) => `${Math.round(v)}`} />
        <YAxis type="category" dataKey="factor" width={116} fontSize={11.5} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: "rgba(14,116,144,0.05)" }} content={<Tip unit={unit} base={base} swing={swing} />} />
        <ReferenceLine x={base} stroke="#0f2233" strokeDasharray="4 3" strokeWidth={1.5}
          label={{ value: `base ${f1(base)}`, position: "top", fontSize: 10, fill: "#0f2233" }} />
        {/* invisible spacer to the low end */}
        <Bar dataKey="offset" stackId="t" fill="transparent" isAnimationActive={false} />
        {/* the visible swing span */}
        <Bar dataKey="span" stackId="t" radius={[3, 3, 3, 3]} isAnimationActive={false} barSize={20}>
          {rows.map((_, i) => <Cell key={i} fill="#0e7490" fillOpacity={0.78} />)}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}
