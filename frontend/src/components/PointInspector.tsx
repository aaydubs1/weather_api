import type { ApiResponse, DataRow } from "../types";

const LABELS = ["Temperature (ºC)", "Pressure (hpa)", "Speed (m/s)"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDateTime(iso: string): string {
  const [datePart, rest] = String(iso).split("T");
  const [, m, d] = datePart.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}, ${rest ? rest.slice(0, 5) : ""}`;
}
function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}
function unitOf(label: string): string {
  const m = label.match(/\(([^)]+)\)/);
  return m ? m[1] : "";
}

/** Beaufort wind force from m/s — a standard, citable scale (no invented science). */
function beaufort(ms: number): { n: number; name: string } {
  const scale: [number, string][] = [
    [0.5, "Calm"], [1.6, "Light air"], [3.4, "Light breeze"], [5.5, "Gentle breeze"],
    [8, "Moderate breeze"], [10.8, "Fresh breeze"], [13.9, "Strong breeze"], [17.2, "Near gale"],
    [20.8, "Gale"], [24.5, "Strong gale"], [28.5, "Storm"], [32.7, "Violent storm"],
  ];
  for (let i = 0; i < scale.length; i++) if (ms < scale[i][0]) return { n: i, name: scale[i][1] };
  return { n: 12, name: "Hurricane force" };
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function compass(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

type Kind = "temperature" | "pressure" | "speed";
function kindOf(label: string): Kind {
  if (label.startsWith("Temperature")) return "temperature";
  if (label.startsWith("Pressure")) return "pressure";
  return "speed";
}

/** Plain-language, defensible finding for one measurement (named scale / flag only). */
function finding(kind: Kind, value: number): string {
  if (kind === "temperature") return value < 0 ? "Below freezing" : "Above freezing";
  if (kind === "speed") {
    const b = beaufort(value);
    // Tie wind directly to the turbine operating band (the feasibility question).
    const band = value < 3 ? "below cut-in (3 m/s)" : value > 25 ? "above cut-out (25 m/s)" : "in the turbine's operating band";
    return `Beaufort ${b.n} (${b.name}) · ${band}`;
  }
  // Pressure vs the standard sea-level reference (1013 hPa).
  if (value < 1010) return "Below standard sea-level pressure (1013 hPa)";
  if (value > 1016) return "Above standard sea-level pressure (1013 hPa)";
  return "Near standard sea-level pressure (1013 hPa)";
}

interface Metric {
  label: string;
  kind: Kind;
  unit: string;
  value: number;
  min: number;
  max: number;
  mean: number;
  pct: number; // % of the period strictly below this value
  isMin: boolean;
  isMax: boolean;
}

function buildMetrics(result: ApiResponse, row: DataRow): Metric[] {
  const first = result.data[0] ?? {};
  const aggregated = result.aggregation !== "None";
  const present = LABELS.filter((label) =>
    Object.keys(first).some((k) => k === label || k.startsWith(`${label} `))
  );
  const metrics: Metric[] = [];
  for (const label of present) {
    const key = aggregated ? `${label} mean` : label;
    const value = row[key];
    if (typeof value !== "number") continue;
    const values = result.data.map((r) => r[key]).filter((v): v is number => typeof v === "number");
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const below = values.filter((v) => v < value).length;
    metrics.push({
      label, kind: kindOf(label), unit: unitOf(label),
      value, min, max, mean,
      pct: Math.round((below / values.length) * 100),
      isMin: value === min, isMax: value === max,
    });
  }
  return metrics;
}

/** Where `value` sits on the period's [min, max] track, as a 0–100% position. */
function pos(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

/** The percentile chip wording: extremes are called out, otherwise "<verb> than N%". */
function rankText(m: Metric): string {
  if (m.isMax) return "Highest in period";
  if (m.isMin) return "Lowest in period";
  const verb = m.kind === "temperature" ? "Warmer" : m.kind === "speed" ? "Windier" : "Higher";
  return `${verb} than ${m.pct}%`;
}

export function PointInspector({ result, datetime, onClose }: { result: ApiResponse; datetime: string; onClose: () => void }) {
  const row = result.data.find((r) => r.Datetime === datetime);
  if (!row) return null;
  const metrics = buildMetrics(result, row);
  const aggregated = result.aggregation !== "None";

  // Wind extras (new source fields) shown when present — direction and gust matter for siting.
  const windDir = typeof row["Wind direction (°)"] === "number" ? (row["Wind direction (°)"] as number) : null;
  const gustRaw = row["Gust (m/s)"] ?? row["Peak gust (m/s)"];
  const gust = typeof gustRaw === "number" ? gustRaw : null;

  return (
    <>
      <div className="inspector-backdrop" onClick={onClose} />
      <aside className="inspector">
        <div className="inspector-head">
          <div>
            <div className="inspector-title">{fmtDateTime(datetime)}</div>
            <div className="inspector-sub">How this point compares to your period</div>
          </div>
          <button type="button" className="inspector-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {metrics.map((m) => (
          <div className="metric" key={m.label}>
            <div className="metric-top">
              <span className="metric-name">{m.label}</span>
              <span className="metric-rank">{rankText(m)}</span>
            </div>
            <div className="metric-value">
              {fmtNum(m.value)} <span className="metric-unit">{m.unit}</span>
              {aggregated && <span className="metric-unit"> (mean)</span>}
            </div>
            <div className="scale">
              <div className="scale-fill" style={{ width: `${pos(m.value, m.min, m.max)}%` }} />
              <div className="scale-mean" style={{ left: `${pos(m.mean, m.min, m.max)}%` }} title={`Period average: ${fmtNum(m.mean)}${m.unit}`} />
              <div className="scale-dot" style={{ left: `${pos(m.value, m.min, m.max)}%` }} />
            </div>
            <div className="scale-ends">
              <span>{fmtNum(m.min)}</span>
              <span>{fmtNum(m.max)}</span>
            </div>
            <div className="metric-finding">{finding(m.kind, m.value)}</div>
          </div>
        ))}

        {(windDir !== null || gust !== null) && (
          <div className="wind-extra">
            <span className="metric-name">Wind detail</span>
            <div className="wind-extra-rows">
              {windDir !== null && <span>Direction <b>{compass(windDir)}</b> ({Math.round(windDir)}°)</span>}
              {gust !== null && <span>Gust <b>{fmtNum(gust)} m/s</b></span>}
            </div>
          </div>
        )}

        <div className="inspector-foot">
          Descriptive context from your data and the Beaufort scale — not an engineering recommendation.
        </div>
      </aside>
    </>
  );
}
