import { useState } from "react";
import type { ApiResponse, MeasurementKey } from "../types";
import { CombinedChart } from "./CombinedChart";

const ALL: MeasurementKey[] = ["temperature", "pressure", "speed"];
const ALL_LABELS = ["Temperature (ºC)", "Pressure (hpa)", "Speed (m/s)"];
const KEY_LABEL: Record<MeasurementKey, string> = {
  temperature: "Temperature",
  pressure: "Pressure",
  speed: "Wind speed",
};

interface Props {
  current: ApiResponse;
  currentMeasurements: MeasurementKey[];
  fetchFor: (measurements: MeasurementKey[]) => Promise<ApiResponse>;
}

/**
 * "Correlate" opens the combined multi-axis chart. If the query has 2+ measurements
 * it reuses the current data; if it has only one, "Correlate with…" lets the user add
 * one of the other measurements (or both), fetching them on demand.
 */
export function CorrelateButton({ current, currentMeasurements, fetchFor }: Props) {
  const [modalData, setModalData] = useState<ApiResponse | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const single = currentMeasurements.length === 1;
  const others = ALL.filter((m) => !currentMeasurements.includes(m));

  async function correlateWith(extra: MeasurementKey[]) {
    setMenuOpen(false);
    setLoading(true);
    try {
      setModalData(await fetchFor([...currentMeasurements, ...extra]));
    } finally {
      setLoading(false);
    }
  }

  function handleClick() {
    if (single) setMenuOpen((o) => !o);
    else setModalData(current);
  }

  return (
    <div className="correlate">
      <button type="button" className="corr-btn" onClick={handleClick} disabled={loading}>
        {loading ? "…" : single ? "Correlate with ▾" : "Correlate"}
      </button>

      {menuOpen && single && (
        <>
          <div className="corr-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="corr-menu">
            {others.map((m) => (
              <button type="button" key={m} onClick={() => correlateWith([m])}>{KEY_LABEL[m]}</button>
            ))}
            <button type="button" onClick={() => correlateWith(others)}>Both</button>
          </div>
        </>
      )}

      {modalData && (
        <div className="lightbox-backdrop" onClick={() => setModalData(null)}>
          <div className="lightbox-panel" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-head">
              <span className="lightbox-title">Correlation · {modalData.station}</span>
              <button type="button" className="lightbox-close" onClick={() => setModalData(null)}>×</button>
            </div>
            <CombinedChart rows={modalData.data} labels={ALL_LABELS} aggregated={modalData.aggregation !== "None"} height={460} />
          </div>
        </div>
      )}
    </div>
  );
}
