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

export function SummaryCards({ summaries }: { summaries: MeasurementSummary[] }) {
  if (!summaries.length) return null;

  return (
    <div className="summary-grid">
      {summaries.map((s) => {
        const unit = unitOf(s.label);
        return (
          <div className="summary-card" key={s.label}>
            <div className="summary-name">{nameOf(s.label)}</div>
            <div className="summary-mean">
              {s.mean ?? "—"}
              <span className="summary-unit">{unit}</span>
            </div>
            <div className="summary-label">Average</div>

            <div className="summary-extremes">
              <div className="extreme high">
                <span className="ex-caption">Highest</span>
                <span className="ex-value">{s.highest ? `${s.highest.value} ${unit}` : "—"}</span>
                {s.highest && <span className="ex-time">{formatTime(s.highest.datetime)}</span>}
              </div>
              <div className="extreme low">
                <span className="ex-caption">Lowest</span>
                <span className="ex-value">{s.lowest ? `${s.lowest.value} ${unit}` : "—"}</span>
                {s.lowest && <span className="ex-time">{formatTime(s.lowest.datetime)}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
