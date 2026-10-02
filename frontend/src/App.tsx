import { useEffect, useState } from "react";
import { fetchData, fetchStations } from "./api";
import { QueryForm } from "./components/QueryForm";
import { ResultsChart } from "./components/ResultsChart";
import { ResultsTable } from "./components/ResultsTable";
import { ResourcePanel } from "./components/ResourcePanel";
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

export function App() {
  const [stations, setStations] = useState<Station[]>([]);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "feasibility" is the default landing (the business conclusion); "chart"/"table" are the
  // raw-data side ("Data"). See the UX rationale in DESIGN.md §7.
  const [view, setView] = useState<"feasibility" | "chart" | "table">("feasibility");
  const [filtersOpen, setFiltersOpen] = useState(true);
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

  const inData = view !== "feasibility";
  const hasData = !loading && !error && result && result.count > 0;

  return (
    <div className="app">
      <header className="header">
        <h1>Antártida — Wind &amp; Solar Feasibility Explorer</h1>
        <p>Could on-site renewables cut a Spanish Antarctic base's diesel use? Historical AEMET data, as decision-support.</p>
      </header>

      <main className="layout">
        {/* Kept mounted (only hidden) so the current selection is preserved when reopened. */}
        <div className={filtersOpen ? "toolbar-wrap" : "toolbar-wrap hidden"}>
          <QueryForm stations={stations} loading={loading} onSubmit={runQuery} />
        </div>
        <section className="card results">
          {loading && <p className="hint">Loading data…</p>}
          {error && <p className="error">⚠ {error}</p>}

          {!loading && !error && result && result.count === 0 && (
            <p className="hint">
              No data for this range. The Antarctic stations report mainly during the austral
              summer (Dec–Feb), so try a <strong>Summer</strong> preset in the date picker.
            </p>
          )}

          {hasData && (
            <>
              <div className="results-head">
                <div className="meta">
                  <strong>{result!.station}</strong>
                  <span className="badge">{result!.aggregation}</span>
                  {lastParams && <span className="date-range">{fmtRange(lastParams.start, lastParams.end)}</span>}
                  <span className="muted">· times in {result!.timezone}</span>
                </div>
                <div className="head-actions">
                  {!filtersOpen && (
                    <button className="reopen-btn" type="button" onClick={() => setFiltersOpen(true)}>
                      ⚙ Edit search
                    </button>
                  )}
                  {view === "table" && (
                    <DownloadMenu
                      items={[
                        { label: "CSV", onClick: () => downloadCSV(result!) },
                        { label: "JSON", onClick: () => downloadJSON(result!) },
                        { label: "Excel (.xlsx)", onClick: () => downloadXLSX(result!) },
                      ]}
                    />
                  )}
                  {/* Primary nav: the business report vs the raw data. */}
                  <div className="toggle">
                    <button className={!inData ? "on" : ""} onClick={() => setView("feasibility")}>Feasibility</button>
                    <button className={inData ? "on" : ""} onClick={() => setView(inData ? view : "chart")}>Data</button>
                  </div>
                  {inData && (
                    <div className="toggle">
                      <button className={view === "chart" ? "on" : ""} onClick={() => setView("chart")}>Chart</button>
                      <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}>Table</button>
                    </div>
                  )}
                </div>
              </div>

              {view === "feasibility" ? (
                <ResourcePanel result={result!} />
              ) : view === "chart" ? (
                <ResultsChart result={result!} />
              ) : (
                <ResultsTable result={result!} />
              )}
            </>
          )}

          {!loading && !error && !result && (
            <p className="hint">Choose the parameters and press <strong>Search</strong>.</p>
          )}
        </section>
      </main>
    </div>
  );
}
