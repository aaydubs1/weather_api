import { useEffect, useState } from "react";
import { fetchData, fetchStations } from "./api";
import { QueryForm } from "./components/QueryForm";
import { ResultsChart } from "./components/ResultsChart";
import { ResultsTable } from "./components/ResultsTable";
import { ResourcePanel } from "./components/ResourcePanel";
import { GuidePanel } from "./components/GuidePanel";
import { DownloadMenu } from "./components/DownloadMenu";
import { downloadCSV, downloadJSON, downloadXLSX } from "./download";
import type { ApiResponse, QueryParams, Station } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-12-01T00:00:00" -> "1 Dec 2025" */
function fmtDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
function fmtRange(start: string, end: string): string {
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}

type View = "feasibility" | "chart" | "table";

// Page title + subtitle per view — shown in the top bar, dashboard-style.
const TITLES: Record<View, [string, string]> = {
  feasibility: ["Wind Feasibility", "Is on-site wind technically operable and economically worth it? Both gates must hold."],
  chart: ["Data · Chart", "Linked time series across the measurements you selected."],
  table: ["Data · Table", "Every reading in the window — sortable, and exportable to CSV/JSON/Excel."],
};

/** Small brand mark: a stylised turbine on a rounded tile. */
function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 36 36" aria-hidden="true">
      <rect width="36" height="36" rx="9" fill="var(--accent)" />
      <g stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none">
        <line x1="18" y1="19" x2="18" y2="28" />
        <path d="M18 18 L18 9" />
        <path d="M18 18 L26 22" />
        <path d="M18 18 L10 22" />
      </g>
      <circle cx="18" cy="18" r="2" fill="#fff" />
    </svg>
  );
}

export function App() {
  const [stations, setStations] = useState<Station[]>([]);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "feasibility" is the default landing (the business conclusion); "chart"/"table" are the
  // raw-data side ("Data"). See the UX rationale in DESIGN.md §7.
  const [view, setView] = useState<View>("feasibility");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [guideOpen, setGuideOpen] = useState(true);
  const [lastParams, setLastParams] = useState<QueryParams | null>(null);

  useEffect(() => {
    fetchStations().then(setStations).catch((e: Error) => setError(e.message));
  }, []);

  async function runQuery(params: QueryParams) {
    setFiltersOpen(false); // collapse the filters to give the charts more vertical space
    setLastParams(params);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await fetchData(params));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const hasData = !loading && !error && result && result.count > 0;
  const [title, subtitle] = TITLES[view];

  const NavItem = ({ v, label }: { v: View; label: string }) => (
    <button className={view === v ? "nav-item on" : "nav-item"} onClick={() => setView(v)}>
      <span className="nav-dot" /> {label}
    </button>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <div className="brand-text">
            <strong>Antártida</strong>
            <span>Wind Feasibility</span>
          </div>
        </div>

        <nav className="nav" id="tour-nav">
          <div className="nav-group">Report</div>
          <NavItem v="feasibility" label="Feasibility" />
          <div className="nav-group">Data</div>
          <NavItem v="chart" label="Chart" />
          <NavItem v="table" label="Table" />
        </nav>

        {hasData && lastParams && (
          <div className="side-context">
            <div className="sc-title">Current selection</div>
            <div className="sc-row"><span>Station</span><b>{result!.station}</b></div>
            <div className="sc-row"><span>Range</span><b>{fmtRange(lastParams.start, lastParams.end)}</b></div>
            <div className="sc-row"><span>Aggregation</span><b>{result!.aggregation}</b></div>
            <div className="sc-row"><span>Times in</span><b>{result!.timezone}</b></div>
          </div>
        )}

        <div className="side-foot">Decision-support over AEMET Antártida data — not a quote.</div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="topbar-text">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="topbar-actions">
            {!guideOpen && (
              <button className="reopen-btn guide-toggle" type="button" onClick={() => setGuideOpen(true)}>📘 Guide</button>
            )}
            {hasData && lastParams && <span className="date-chip">🗓 {fmtRange(lastParams.start, lastParams.end)}</span>}
            {hasData && !filtersOpen && (
              <button className="reopen-btn" type="button" onClick={() => setFiltersOpen(true)}>⚙ Edit search</button>
            )}
            {hasData && view === "table" && (
              <DownloadMenu
                items={[
                  { label: "CSV", onClick: () => downloadCSV(result!) },
                  { label: "JSON", onClick: () => downloadJSON(result!) },
                  { label: "Excel (.xlsx)", onClick: () => downloadXLSX(result!) },
                ]}
              />
            )}
          </div>
        </header>

        {/* Kept mounted (only hidden) so the current selection is preserved when reopened. */}
        <div id="tour-query" className={filtersOpen ? "toolbar-wrap" : "toolbar-wrap hidden"}>
          <QueryForm stations={stations} loading={loading} onSubmit={runQuery} />
        </div>

        <section className="card results" id="tour-data">
          {loading && <p className="hint">Loading data…</p>}
          {error && <p className="error">⚠ {error}</p>}

          {!loading && !error && result && result.count === 0 && (
            <p className="hint">
              No data for this range. The Antarctic stations report mainly during the austral
              summer (Dec–Feb), so try a <strong>Summer</strong> preset in the date picker.
            </p>
          )}

          {hasData && (
            view === "feasibility" ? (
              <ResourcePanel result={result!} />
            ) : view === "chart" ? (
              <ResultsChart result={result!} />
            ) : (
              <ResultsTable result={result!} />
            )
          )}

          {!loading && !error && !result && (
            <p className="hint">Choose the parameters and press <strong>Search</strong>.</p>
          )}
        </section>
      </main>

      {guideOpen && <GuidePanel view={view} onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
