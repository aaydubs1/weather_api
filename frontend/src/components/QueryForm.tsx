import { useEffect, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
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

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rangeLabel(range: DateRange | undefined): string {
  if (!range?.from) return "Select a date range";
  const from = range.from.toLocaleDateString();
  const to = range.to ? range.to.toLocaleDateString() : from;
  return from === to ? from : `${from}  →  ${to}`;
}

function useIsNarrow(query = "(max-width: 640px)"): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = () => setNarrow(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);
  return narrow;
}

export function QueryForm({ stations, loading, onSubmit }: Props) {
  const [station, setStation] = useState("");
  const [range, setRange] = useState<DateRange | undefined>({
    from: new Date(2023, 6, 1),
    to: new Date(2023, 6, 2),
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [aggregation, setAggregation] = useState<Aggregation>("Hourly");
  const [measurements, setMeasurements] = useState<MeasurementKey[]>(["temperature"]);
  const isNarrow = useIsNarrow();

  useEffect(() => {
    if (!station && stations.length) setStation(stations[0].key);
  }, [stations, station]);

  function toggle(measurement: MeasurementKey) {
    setMeasurements((current) =>
      current.includes(measurement) ? current.filter((m) => m !== measurement) : [...current, measurement]
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const from = range?.from ?? new Date();
    const to = range?.to ?? from;
    onSubmit({
      station,
      start: `${toYMD(from)}T00:00:00`,
      end: `${toYMD(to)}T23:59:59`,
      aggregation,
      measurements,
    });
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

      <div className="field">
        <label>Date range</label>
        <button type="button" className="date-field" onClick={() => setCalendarOpen((o) => !o)}>
          {rangeLabel(range)}
        </button>
        {calendarOpen && (
          <>
            <div className="backdrop" onClick={() => setCalendarOpen(false)} />
            <div className="popover">
              <DayPicker
                mode="range"
                numberOfMonths={isNarrow ? 1 : 2}
                defaultMonth={range?.from}
                selected={range}
                onSelect={setRange}
              />
              <div className="popover-actions">
                <button type="button" className="ghost" onClick={() => setCalendarOpen(false)}>Done</button>
              </div>
            </div>
          </>
        )}
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
        <label>Measurements <span className="muted">(none = all)</span></label>
        <div className="pills">
          {MEASUREMENTS.map((m) => {
            const active = measurements.includes(m.key);
            return (
              <button
                type="button"
                key={m.key}
                className={`pill ${active ? "on" : ""}`}
                onClick={() => toggle(m.key)}
                aria-pressed={active}
              >
                <span className="pill-icon">{active ? "×" : "+"}</span>
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <button className="primary" type="submit" disabled={loading || !station}>
        {loading ? "Querying…" : "Query"}
      </button>
    </form>
  );
}
