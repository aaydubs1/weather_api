import { useEffect, useState } from "react";
import { fetchData, fetchStations } from "./api";
import { QueryForm } from "./components/QueryForm";
import { ResultsChart } from "./components/ResultsChart";
import { ResultsTable } from "./components/ResultsTable";
import type { ApiResponse, QueryParams, Station } from "./types";

export function App() {
  const [stations, setStations] = useState<Station[]>([]);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");

  useEffect(() => {
    fetchStations().then(setStations).catch((e: Error) => setError(e.message));
  }, []);

  async function runQuery(params: QueryParams) {
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

  return (
    <div className="app">
      <header className="header">
        <h1>Antártida Weather Explorer</h1>
        <p>Historical weather data from the AEMET Antarctic stations.</p>
      </header>

      <main className="layout">
        <QueryForm stations={stations} loading={loading} onSubmit={runQuery} />

        <section className="card results">
          {loading && <p className="hint">Loading data…</p>}
          {error && <p className="error">⚠ {error}</p>}

          {!loading && !error && result && result.count === 0 && (
            <p className="hint">No data available for this station and time range.</p>
          )}

          {!loading && !error && result && result.count > 0 && (
            <>
              <div className="results-head">
                <div className="meta">
                  <strong>{result.station}</strong>
                  <span className="badge">{result.aggregation}</span>
                  <span className="muted">· {result.count} rows · times in {result.timezone}</span>
                </div>
                <div className="toggle">
                  <button className={view === "chart" ? "on" : ""} onClick={() => setView("chart")}>Chart</button>
                  <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}>Table</button>
                </div>
              </div>
              {view === "chart" ? <ResultsChart result={result} /> : <ResultsTable result={result} />}
            </>
          )}

          {!loading && !error && !result && (
            <p className="hint">Choose the parameters on the left and press <strong>Query</strong>.</p>
          )}
        </section>
      </main>
    </div>
  );
}
