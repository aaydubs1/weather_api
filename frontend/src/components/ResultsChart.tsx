import { useEffect, useRef, useState } from "react";
import {
  Area, Brush, CartesianGrid, ComposedChart, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ApiResponse, DataRow } from "../types";
import { DownloadMenu } from "./DownloadMenu";
import { PointInspector } from "./PointInspector";
import { baseName, downloadChartPNG, downloadChartSVG } from "../download";

const LABELS = ["Temperature (ºC)", "Pressure (hpa)", "Speed (m/s)"];
const SYNC_ID = "weather";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Series {
  key: string;
  color: string;
  area: boolean; // marks the primary series (mean / value line)
}

// Only two colours exist on the chart: the mean line (accent teal) and the min–max band
// (soft sky blue). Max and Min are the two edges of that same band, so they share its colour.
const PALETTE = { mean: "#0e7490", band: "#60c5f1" };

function seriesFor(label: string, aggregated: boolean, first: DataRow): Series[] {
  if (!aggregated) return [{ key: label, color: PALETTE.mean, area: true }];
  return [
    { key: `${label} mean`, color: PALETTE.mean, area: true },
    { key: `${label} max`, color: PALETTE.band, area: false },
    { key: `${label} min`, color: PALETTE.band, area: false },
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

/** Tooltip for the dense band view: reads the hovered row and lists Max / Mean / Min. */
function BandTooltip({ active, payload, label, meanKey, minKey, maxKey, unit }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  const line = (name: string, key: string, color: string) => {
    const v = row[key];
    if (v === null || v === undefined) return null;
    return (
      <div className="ctip-row" key={name}>
        <span className="ctip-dot" style={{ background: color }} />
        <span className="ctip-name">{name}</span>
        <span className="ctip-val">{v}{unit}</span>
      </div>
    );
  };
  return (
    <div className="ctip">
      <div className="ctip-time">{fmtDateTime(String(label))}</div>
      {line("Max", maxKey, PALETTE.band)}
      {line("Mean", meanKey, PALETTE.mean)}
      {line("Min", minKey, PALETTE.band)}
    </div>
  );
}

/** A linked panel. All panels share `syncId`, so hovering one shows the cursor at the same
 *  instant on every panel. Aggregated data is always drawn as a translucent min–max BAND
 *  with the mean as one crisp line on top (clean at any density, one day or a whole season);
 *  a "None" query has no min/max, so it is a single line. No gradient fill. */
function Panel({ rows, series, height, xTick, onPointClick }: { rows: DataRow[]; series: Series[]; height: number; xTick: (iso: string) => string; onPointClick?: (datetime: string) => void }) {
  const meanS = series.find((s) => s.area) ?? series[0];
  const minS = series.find((s) => s.key.endsWith(" min"));
  const maxS = series.find((s) => s.key.endsWith(" max"));
  const banded = !!(minS && maxS);
  const unit = unitOf(meanS.key);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={rows}
        syncId={SYNC_ID}
        margin={{ top: 14, right: 20, bottom: 0, left: 0 }}
        onClick={onPointClick ? (s: any) => { if (s?.activeLabel) onPointClick(String(s.activeLabel)); } : undefined}
        style={onPointClick ? { cursor: "pointer" } : undefined}
      >
        <CartesianGrid vertical={false} stroke="#eef2f7" />
        <XAxis dataKey="Datetime" tickFormatter={xTick} minTickGap={44} fontSize={11} height={20} tickLine={false} axisLine={false} />
        <YAxis domain={["auto", "auto"]} width={48} fontSize={11} tickLine={false} axisLine={false} />
        {banded ? (
          <Tooltip content={<BandTooltip meanKey={meanS.key} minKey={minS!.key} maxKey={maxS!.key} unit={unit} />} />
        ) : (
          <Tooltip labelFormatter={(v: string) => fmtDateTime(v)} />
        )}
        <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        {banded && (
          <Area
            type="monotone"
            dataKey={(d: DataRow) => {
              const lo = d[minS!.key]; const hi = d[maxS!.key];
              return lo == null || hi == null ? null : [lo as number, hi as number];
            }}
            name="Min–Max"
            stroke="none"
            fill={PALETTE.band}
            fillOpacity={0.22}
            isAnimationActive={false}
            activeDot={false}
          />
        )}
        <Line
          type="monotone"
          dataKey={meanS.key}
          name={banded ? "Mean" : "Value"}
          stroke={meanS.color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Slim overview scrubber at the top: drag the handles to zoom every panel at once. */
function ZoomBar({ rows, dataKey, onChange }: { rows: DataRow[]; dataKey: string; onChange: (z: { start: number; end: number } | null) => void }) {
  return (
    <div className="zoombar">
      <ResponsiveContainer width="100%" height={46}>
        <LineChart data={rows} margin={{ top: 2, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="Datetime" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <Line dataKey={dataKey} stroke="#cbd5e1" dot={false} strokeWidth={1} isAnimationActive={false} />
          <Brush
            dataKey="Datetime"
            className="wx-brush"
            height={30}
            stroke="#cbd5e1"
            fill="#f1f5f9"
            travellerWidth={10}
            gap={1}
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

/** One panel plus its header (title, download PNG/SVG, enlarge). Holds a ref so the
 *  download menu can grab this panel's live <svg> and export exactly what is on screen. */
function ChartBlock({
  label, rows, series, height, xTick, namePrefix, onEnlarge, onPointClick,
}: {
  label: string;
  rows: DataRow[];
  series: Series[];
  height: number;
  xTick: (iso: string) => string;
  namePrefix: string;
  onEnlarge: () => void;
  onPointClick: (datetime: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fname = `${namePrefix}_${label.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;
  const exportWith = (fn: (svg: SVGSVGElement, name: string) => void) => {
    const svg = ref.current?.querySelector("svg.recharts-surface") as SVGSVGElement | null;
    if (svg) fn(svg, fname);
  };
  return (
    <div className="chart-block" ref={ref}>
      <div className="chart-head">
        <h4 className="chart-title">{label}</h4>
        <div className="chart-tools">
          <DownloadMenu
            variant="icon"
            title="Download chart"
            items={[
              { label: "PNG", onClick: () => exportWith(downloadChartPNG) },
              { label: "SVG", onClick: () => exportWith(downloadChartSVG) },
            ]}
          />
          <button type="button" className="expand-btn" title="Enlarge" onClick={onEnlarge}>⤢</button>
        </div>
      </div>
      <Panel rows={rows} series={series} height={height} xTick={xTick} onPointClick={onPointClick} />
    </div>
  );
}

export function ResultsChart({ result }: { result: ApiResponse }) {
  const rows = result.data;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState<{ start: number; end: number } | null>(null);
  const expandedRef = useRef<HTMLDivElement>(null);

  const exportExpanded = (fn: (svg: SVGSVGElement, name: string) => void) => {
    const svg = expandedRef.current?.querySelector("svg.recharts-surface") as SVGSVGElement | null;
    if (svg && expanded) fn(svg, `${baseName(result)}_${expanded.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`);
  };

  useEffect(() => { setZoom(null); setSelected(null); }, [result]);

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
  // TODO (DESIGN §7.7): if a range ever spans the CET<->CEST change (late Mar / late Oct),
  // draw a subtle ReferenceLine at the transition. Skipped for now: the seasonal
  // (Dec-Feb) data never crosses it, so it would add code for no practical benefit.
  const overviewKey = aggregated ? `${present[0]} mean` : present[0];

  return (
    <>
      <p className="charts-hint">Hover any panel to read all measurements at the same instant · drag the slider to zoom all.</p>
      <ZoomBar rows={rows} dataKey={overviewKey} onChange={setZoom} />

      <div className="charts-area">
        <div className="panels">
          {present.map((label) => (
            <ChartBlock
              key={label}
              label={label}
              rows={shown}
              series={seriesFor(label, aggregated, first)}
              height={160}
              xTick={xTick}
              namePrefix={baseName(result)}
              onEnlarge={() => setExpanded(label)}
              onPointClick={setSelected}
            />
          ))}
        </div>
        {selected && <PointInspector result={result} datetime={selected} onClose={() => setSelected(null)} />}
      </div>

      {expanded && (
        <div className="lightbox-backdrop" onClick={() => setExpanded(null)}>
          <div className="lightbox-panel" ref={expandedRef} onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-head">
              <span className="lightbox-title">{expanded}</span>
              <div className="chart-tools">
                <DownloadMenu
                  variant="icon"
                  title="Download chart"
                  items={[
                    { label: "PNG", onClick: () => exportExpanded(downloadChartPNG) },
                    { label: "SVG", onClick: () => exportExpanded(downloadChartSVG) },
                  ]}
                />
                <button type="button" className="lightbox-close" onClick={() => setExpanded(null)}>×</button>
              </div>
            </div>
            <Panel rows={shown} series={seriesFor(expanded, aggregated, first)} height={460} xTick={xTick} />
          </div>
        </div>
      )}
    </>
  );
}
