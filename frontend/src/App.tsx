import { useEffect, useState } from "react";
import { fetchData, fetchStations } from "./api";
import { QueryForm } from "./components/QueryForm";
import { ResultsChart } from "./components/ResultsChart";
import { ResultsTable } from "./components/ResultsTable";
import { CorrelateButton } from "./components/CorrelateButton";
import type { ApiResponse, MeasurementKey, QueryParams, Station } from "./types";

const ALL_MEASUREMENTS: MeasurementKey[] = ["temperature", "pressure", "speed"];

export function App() {
  const [stations, setStations] = useState<Station[]>([]);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
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

  // Fetch the same query with a different set of measurements (used by "Correlate with…"
  // when the current query has a single measurement and the user wants to add others).
  const fetchFor = (measurements: MeasurementKey[]) =>
    fetchData({ ...lastParams!, measurements });

  // Measurements actually in the current result (empty request means "all three").
  const currentMeasurements: MeasurementKey[] =
    lastParams?.measurements?.length ? lastParams.measurements : ALL_MEASUREMENTS;

  const hasData = !loading && !error && result && result.count > 0;

  return (
    <div className="app">
      <header className="header">
        <h1>Antártida Weather Explorer</h1>
        <p>Historical weather data from the AEMET Antarctic stations.</p>
      </header>

      <main className="layout">
        {/* Kept mounted (only hidden) so the current selection is preserved when reopened. */}
        <div className={filtersOpen ? "toolbar-wrap" : "toolbar-wrap hidden"}>
          <QueryForm stations={stations} loading={loading} onSubmit={runQuery} />
        </div>
        {!filtersOpen && (
          <button className="reopen-btn" type="button" onClick={() => setFiltersOpen(true)}>
            ⚙ Edit search
          </button>
        )}

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
                  <span className="muted">· {result!.count} rows · times in {result!.timezone}</span>
                </div>
                <div className="head-actions">
                  {view === "chart" && (
                    <CorrelateButton
                      current={result!}
                      currentMeasurements={currentMeasurements}
                      fetchFor={fetchFor}
                    />
                  )}
                  <div className="toggle">
                    <button className={view === "chart" ? "on" : ""} onClick={() => setView("chart")}>Chart</button>
                    <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}>Table</button>
                  </div>
                </div>
              </div>

              {view === "chart" ? <ResultsChart result={result!} /> : <ResultsTable result={result!} />}
            </>
          )}

          {!loading && !error && !result && (
            <p className="hint">Choose the parameters and press <strong>Query</strong>.</p>
          )}
        </section>
      </main>
    </div>
  );
}
