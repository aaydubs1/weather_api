import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface StateSlice {
  name: string;
  value: number; // % of the time
  color: string;
  rule?: string; // the threshold condition that defines this state
}

function Tip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload as StateSlice;
  return (
    <div className="ctip">
      <div className="ctip-row"><span className="ctip-dot" style={{ background: s.color }} /><span className="ctip-name">{s.name}</span><span className="ctip-val">{s.value}%</span></div>
    </div>
  );
}

/** Donut of the turbine's operating state over the period: how much of the time it is
 *  generating within its thresholds vs stopped (too weak / storm / cold or icing). The
 *  "generating" share is the technical side of viability. */
export function OperatingStateChart({ data, generatingPct }: { data: StateSlice[]; generatingPct: number }) {
  return (
    <div className="opstate">
      <div className="opstate-donut">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="84%" startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
              {data.map((s) => <Cell key={s.name} fill={s.color} />)}
            </Pie>
            <Tooltip content={<Tip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center"><b>{generatingPct}%</b><span>generating</span></div>
      </div>
      <ul className="opstate-legend">
        {data.map((s) => (
          <li key={s.name}>
            <i style={{ background: s.color }} />
            <span className="opstate-name">{s.name}{s.rule && <em>{s.rule}</em>}</span>
            <b>{s.value}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
