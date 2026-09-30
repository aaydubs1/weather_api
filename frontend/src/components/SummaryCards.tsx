import type { MeasurementSummary } from "../summary";

function unitOf(label: string): string {
  const match = label.match(/\(([^)]+)\)/);
  return match ? match[1] : "";
}

function nameOf(label: string): string {
  return label.replace(/\s*\(.*\)/, "");
}

function formatTime(datetime: string): string {
  const d = new Date(datetime);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** A thin one-line stats strip per measurement (avg · max · min), above the charts. */
export function SummaryCards({ summaries }: { summaries: MeasurementSummary[] }) {
  if (!summaries.length) return null;

  return (
    <div className="stats-strip">
      {summaries.map((s) => {
        const unit = unitOf(s.label);
        return (
          <div className="stat-row" key={s.label}>
            <span className="stat-name">{nameOf(s.label)}</span>
            <span className="stat-item">
              avg <b>{s.mean ?? "—"}{unit}</b>
            </span>
            <span className="stat-item high">
              ▲ <b>{s.highest ? `${s.highest.value}${unit}` : "—"}</b>
              {s.highest && <span className="stat-time">{formatTime(s.highest.datetime)}</span>}
            </span>
            <span className="stat-item low">
              ▼ <b>{s.lowest ? `${s.lowest.value}${unit}` : "—"}</b>
              {s.lowest && <span className="stat-time">{formatTime(s.lowest.datetime)}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
