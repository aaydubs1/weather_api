import { useEffect, useState } from "react";
import {
  Brush, CartesianGrid, Legend, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ApiResponse, DataRow } from "../types";

const LABELS = ["Temperature (ºC)", "Pressure (hpa)", "Speed (m/s)"];
const SYNC_ID = "weather";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Series {
  key: string;
  name: string;
  color: string;
  width: number;
}

function seriesFor(label: string, aggregated: boolean, first: DataRow): Series[] {
  if (!aggregated) return [{ key: label, name: "Value", color: "#0e7490", width: 2 }];
  return [
    { key: `${label} mean`, name: "Mean", color: "#0e7490", width: 2 },
    { key: `${label} max`, name: "Max", color: "#f97316", width: 1.5 },
    { key: `${label} min`, name: "Min", color: "#2563eb", width: 1.5 },
  ].filter((s) => s.key in first);
}

function unitOf(key: string): string {
  const m = key.match(/\(([^)]+)\)/);
  return m ? m[1] : "";
}

// Format the ISO string WITHOUT changing time zone (it is already Europe/Madrid),
// so CET/CEST is preserved regardless of the viewer's browser zone.
function isoParts(iso: string) {
  const [datePart, rest] = String(iso).split("T");
  const [, m, d] = datePart.split("-").map(Number);
  return { m, d, time: rest ? rest.slice(0, 5) : "" };
}
const fmtDate = (iso: string) => { const p = isoParts(iso); return `${p.d} ${MONTHS[p.m - 1]}`; };
const fmtTime = (iso: string) => isoParts(iso).time;
const fmtDateTime = (iso: string) => { const p = isoParts(iso); return `${p.d} ${MONTHS[p.m - 1]}, ${p.time}`; };

function extremeOf(rows: DataRow[], key: string, kind: "max" | "min"): { x: string; y: number } | null {
  let best: { x: string; y: number } | null = null;
  for (const row of rows) {
    const v = row[key];
    if (typeof v !== "number") continue;
    if (best === null || (kind === "max" ? v > best.y : v < best.y)) best = { x: String(row["Datetime"]), y: v };
  }
  return best;
}

/** A linked panel. All panels share `syncId`, so hovering one shows the cursor at the
 *  same instant on every panel. */
function Panel({ rows, series, height, xTick }: { rows: DataRow[]; series: Series[]; height: number; xTick: (iso: string) => string }) {
  const [active, setActive] = useState<string | null>(null);
  const activeSeries = series.find((s) => s.key === active) ?? null;
  const kind: "max" | "min" = active && active.endsWith("min") ? "min" : "max";
  const extreme = active ? extremeOf(rows, active, kind) : null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} syncId={SYNC_ID} margin={{ top: 14, right: 20, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
        <XAxis dataKey="Datetime" tickFormatter={xTick} minTickGap={44} fontSize={11} height={20} />
        <YAxis domain={["auto", "auto"]} width={48} fontSize={11} />
        <Tooltip labelFormatter={(v: string) => fmtDateTime(v)} />
        <Legend
          iconSize={10}
          wrapperStyle={{ fontSize: 12 }}
          onMouseEnter={(o: any) => setActive(o?.dataKey != null ? String(o.dataKey) : null)}
          onMouseLeave={() => setActive(null)}
        />
        {series.map((s) => {
          const dimmed = active !== null && active !== s.key;
          const highlighted = active === s.key;
          return (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={highlighted ? 3 : s.width}
              strokeOpacity={dimmed ? 0.15 : 1}
              dot={highlighted ? { r: 2, fill: s.color, strokeWidth: 0 } : false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          );
        })}
        {extreme && activeSeries && (
          <ReferenceDot
            x={extreme.x}
            y={extreme.y}
            r={5}
            fill={activeSeries.color}
            stroke="#fff"
            strokeWidth={2}
            isFront
            label={{
              value: `${kind === "min" ? "Min" : "Max"} ${extreme.y}${unitOf(active!)}`,
              position: "top",
              fill: activeSeries.color,
              fontSize: 12,
              fontWeight: 700,
            }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Slim overview scrubber at the top: drag the handles to zoom every panel at once. */
function ZoomBar({ rows, dataKey, onChange }: { rows: DataRow[]; dataKey: string; onChange: (z: { start: number; end: number } | null) => void }) {
  return (
    <div className="zoombar">
      <ResponsiveContainer width="100%" height={46}>
        <LineChart data={rows} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
          <XAxis dataKey="Datetime" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <Line dataKey={dataKey} stroke="#cbd5e1" dot={false} strokeWidth={1} isAnimationActive={false} />
          <Brush
            dataKey="Datetime"
            height={26}
            stroke="#94a3b8"
            travellerWidth={8}
            tickFormatter={fmtDate}
            onChange={(e: any) => {
              if (e && typeof e.startIndex === "number") {
                const full = e.startIndex === 0 && e.endIndex === rows.length - 1;
                onChange(full ? null : { start: e.startIndex, end: e.endIndex });
              }
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ResultsChart({ result }: { result: ApiResponse }) {
  const rows = result.data;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [zoom, setZoom] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => setZoom(null), [result]);

  if (!rows.length) return null;

  const first = rows[0];
  const aggregated = result.aggregation !== "None";
  const present = LABELS.filter((label) =>
    Object.keys(first).some((k) => k === label || k.startsWith(`${label} `))
  );

  const shown = zoom ? rows.slice(zoom.start, zoom.end + 1) : rows;
  const spanMs =
    shown.length > 1
      ? new Date(String(shown[shown.length - 1].Datetime)).getTime() - new Date(String(shown[0].Datetime)).getTime()
      : 0;
  const xTick = spanMs < 2 * 86400000 ? fmtTime : fmtDate;
  const overviewKey = aggregated ? `${present[0]} mean` : present[0];

  return (
    <>
      <p className="charts-hint">Hover any panel to read all measurements at the same instant · drag the slider to zoom all.</p>
      <ZoomBar rows={rows} dataKey={overviewKey} onChange={setZoom} />

      <div className="panels">
        {present.map((label) => (
          <div className="chart-block" key={label}>
            <div className="chart-head">
              <h4 className="chart-title">{label}</h4>
              <button type="button" className="expand-btn" title="Enlarge" onClick={() => setExpanded(label)}>⤢</button>
            </div>
            <Panel rows={shown} series={seriesFor(label, aggregated, first)} height={160} xTick={xTick} />
          </div>
        ))}
      </div>

      {expanded && (
        <div className="lightbox-backdrop" onClick={() => setExpanded(null)}>
          <div className="lightbox-panel" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-head">
              <span className="lightbox-title">{expanded}</span>
              <button type="button" className="lightbox-close" onClick={() => setExpanded(null)}>×</button>
            </div>
            <Panel rows={shown} series={seriesFor(expanded, aggregated, first)} height={460} xTick={xTick} />
          </div>
        </div>
      )}
    </>
  );
}
