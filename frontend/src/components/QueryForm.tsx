import { useEffect, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import type { Aggregation, MeasurementKey, QueryParams, Station } from "../types";

const AGGREGATIONS: Aggregation[] = ["None", "Hourly", "Daily", "Monthly"];
const MEASUREMENTS: { key: MeasurementKey; label: string }[] = [
  { key: "temperature", label: "Temperature" },
  { key: "pressure", label: "Pressure" },
  { key: "speed", label: "Wind speed" },
];

interface SummerPreset {
  id: string;
  label: string;
  from: Date;
  to: Date;
}

/**
 * The Antarctic bases run summer campaigns (austral summer, Dec–Feb), so the useful
 * presets are the most recent summer seasons rather than "last 7 days". A season
 * labelled by its ending year Y spans Dec (Y-1) .. Feb (Y). Computed dynamically.
 */
function summerPresets(count = 3): SummerPreset[] {
  const now = new Date();
  const latestY = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const yy = (n: number) => String(((n % 100) + 100) % 100).padStart(2, "0");

  return Array.from({ length: count }, (_, i) => {
    const y = latestY - i;
    const from = new Date(y - 1, 11, 1); // Dec 1, Y-1
    let to = new Date(y, 1, 28); // Feb 28, Y
    if (to > now) to = now; // never in the future
    return { id: `s${y}`, label: `Summer ${yy(y - 1)}/${yy(y)}`, from, to };
  });
}

const SUMMERS = summerPresets();

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
  if (!range?.from) return "Select dates";
  const from = range.from.toLocaleDateString();
  const to = range.to ? range.to.toLocaleDateString() : from;
  return from === to ? from : `${from} → ${to}`;
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

function InfoTip({ text }: { text: string }) {
  return (
    <span className="infotip" tabIndex={0} aria-label={text}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle className="infotip-circle" cx="8" cy="8" r="7.5" fill="#94a3b8" />
        <circle cx="8" cy="4.6" r="1" fill="#fff" />
        <rect x="7.15" y="6.7" width="1.7" height="5" rx="0.85" fill="#fff" />
      </svg>
      <span className="infotip-bubble">{text}</span>
    </span>
  );
}

const DATA_INFO =
  "Data availability: the Antarctic stations report mainly during the austral summer " +
  "campaigns (Dec–Feb), when the bases are active. Very recent dates may not be published " +
  "yet. Use a Summer preset for guaranteed data.";

/** Custom dropdown replacing the native <select>: the OS-rendered option list cannot be
 *  themed with CSS, so we render our own popover to match the app's menu styling. */
function Dropdown({
  value, options, onChange, label,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <div className="tb-select">
      <button
        type="button"
        className="tb-value tb-select-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <span className="tb-select-value">{current}</span>
        <span className="tb-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <>
          <div className="backdrop" onClick={() => setOpen(false)} />
          <div className="tb-menu" role="listbox">
            {options.map((o) => (
              <button
                type="button"
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className={o.value === value ? "on" : ""}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function QueryForm({ stations, loading, onSubmit }: Props) {
  const [station, setStation] = useState("");
  const [range, setRange] = useState<DateRange | undefined>({ from: SUMMERS[0].from, to: SUMMERS[0].to });
  const [month, setMonth] = useState<Date>(SUMMERS[0].from);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [aggregation, setAggregation] = useState<Aggregation>("Daily");
  const [measurements, setMeasurements] = useState<MeasurementKey[]>(["temperature"]);
  const isNarrow = useIsNarrow();

  useEffect(() => {
    if (!station && stations.length) setStation(stations[0].key);
  }, [stations, station]);

  function applyPreset(preset: SummerPreset) {
    setRange({ from: preset.from, to: preset.to });
    setMonth(preset.from);
  }

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
    <form className="toolbar" onSubmit={handleSubmit}>
      <div className="tb-field">
        <span className="tb-label">Station</span>
        <Dropdown
          label="Station"
          value={station}
          onChange={setStation}
          options={stations.map((s) => ({ value: s.key, label: s.name }))}
        />
      </div>

      <div className="tb-divider" />

      <div className="tb-field grow">
        <span className="tb-label">Date range <InfoTip text={DATA_INFO} /></span>
        <button type="button" className="tb-value" onClick={() => setCalendarOpen((o) => !o)}>
          {rangeLabel(range)}
        </button>
        {calendarOpen && (
          <>
            <div className="backdrop" onClick={() => setCalendarOpen(false)} />
            <div className="popover">
              <div className="presets">
                {SUMMERS.map((p) => (
                  <button type="button" key={p.id} className="preset" onClick={() => applyPreset(p)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <DayPicker
                mode="range"
                numberOfMonths={isNarrow ? 1 : 2}
                month={month}
                onMonthChange={setMonth}
                selected={range}
                onSelect={setRange}
                disabled={{ after: new Date() }}
              />
              <div className="popover-actions">
                <button type="button" className="ghost" onClick={() => setCalendarOpen(false)}>Done</button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="tb-divider" />

      <div className="tb-field">
        <span className="tb-label">Aggregation</span>
        <Dropdown
          label="Aggregation"
          value={aggregation}
          onChange={(v) => setAggregation(v as Aggregation)}
          options={AGGREGATIONS.map((a) => ({ value: a, label: a }))}
        />
      </div>

      <div className="tb-divider" />

      <div className="tb-field grow">
        <span className="tb-label">Measurements <span className="muted">(none = all)</span></span>
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

      <button className="tb-submit" type="submit" disabled={loading || !station}>
        {loading ? "…" : "Search"}
      </button>
    </form>
  );
}
