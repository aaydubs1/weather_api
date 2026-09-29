import { useEffect, useState } from "react";
import type { Aggregation, MeasurementKey, QueryParams, Station } from "../types";

const AGGREGATIONS: Aggregation[] = ["None", "Hourly", "Daily", "Monthly"];
const MEASUREMENTS: { key: MeasurementKey; label: string }[] = [
  { key: "temperature", label: "Temperature" },
  { key: "pressure", label: "Pressure" },
  { key: "speed", label: "Wind speed" },
];

interface Props {
  stations: Station[];
  loading: boolean;
  onSubmit: (params: QueryParams) => void;
}

function withSeconds(value: string): string {
  return value.length === 16 ? `${value}:00` : value;
}

export function QueryForm({ stations, loading, onSubmit }: Props) {
  const [station, setStation] = useState("");
  const [start, setStart] = useState("2023-07-01T00:00");
  const [end, setEnd] = useState("2023-07-02T00:00");
  const [aggregation, setAggregation] = useState<Aggregation>("Hourly");
  const [measurements, setMeasurements] = useState<MeasurementKey[]>(["temperature"]);

  // Pick the first station as a sensible default once the list has loaded.
  useEffect(() => {
    if (!station && stations.length) setStation(stations[0].key);
  }, [stations, station]);

  function toggle(measurement: MeasurementKey) {
    setMeasurements((current) =>
      current.includes(measurement)
        ? current.filter((m) => m !== measurement)
        : [...current, measurement]
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit({ station, start: withSeconds(start), end: withSeconds(end), aggregation, measurements });
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="station">Station</label>
        <select id="station" value={station} onChange={(e) => setStation(e.target.value)}>
          {stations.map((s) => (
            <option key={s.key} value={s.key}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="start">From</label>
          <input id="start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="end">To</label>
          <input id="end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="aggregation">Time aggregation</label>
        <select id="aggregation" value={aggregation} onChange={(e) => setAggregation(e.target.value as Aggregation)}>
          {AGGREGATIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Measurements <span className="muted">(none selected = all)</span></label>
        <div className="checks">
          {MEASUREMENTS.map((m) => (
            <label key={m.key} className="check">
              <input type="checkbox" checked={measurements.includes(m.key)} onChange={() => toggle(m.key)} />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      <button className="primary" type="submit" disabled={loading || !station}>
        {loading ? "Querying…" : "Query"}
      </button>
    </form>
  );
}
