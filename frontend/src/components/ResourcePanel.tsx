import { useState } from "react";
import type { ApiResponse, DataRow } from "../types";
import { CUT_IN, CUT_OUT, RATED, capacityFactor } from "../feasibility";
import { InfoTip } from "./InfoTip";
import { PowerCurveChart } from "./PowerCurveChart";
import { ComplementarityChart } from "./ComplementarityChart";

// Short, defensible explanations surfaced via the "i" tooltips.
const INFO = {
  band: "Share of the period the wind sits in a turbine's productive range (3–25 m/s): above the cut-in speed and below the cut-out shutdown speed.",
  rose: "How often the wind blows from each compass sector. A dominant, steady direction is better for siting a turbine.",
  solar: "Average solar energy per day (mean irradiance × 24 h ÷ 1000). Opens a wind + solar hybrid; in the austral summer daylight is near-continuous.",
  meanWind: "Average wind speed over the period.",
  cv: "Coefficient of variation of wind speed (std ÷ mean). Lower = steadier, more predictable wind.",
  freezing: "Share of time below 0 °C.",
  icing: "Share of time that is both sub-zero and humid (RH > 90%) — the conditions for blade icing, which cuts output.",
  coldPkg: "Share of time below −10 °C, where a standard turbine needs a cold-climate package.",
  density: "Average air density (ρ = P/RT). Cold, dense Antarctic air yields more power than the 1.225 kg/m³ standard.",
  completeness: "Readings received vs expected (one every 10 min) over the window — how much to trust the figures.",
  cf: "Capacity factor: average share of rated power the turbine would make, from the power curve applied to each reading — density-corrected, since the cold, dense Antarctic air yields a little more power.",
  diesel: "Litres of diesel a generator would burn for the same energy, at the L/kWh you set.",
  cost: "Fuel cost avoided = diesel litres × price per litre.",
  co2: "CO₂ not emitted = diesel litres × 2.68 kg/L.",
  payback: "System cost ÷ cost avoided per period — in 'campaigns like this one'. Indicative only.",
  powercurve: "Blue bars: how often the wind blows at each speed over the period. Green line: the share of rated power a turbine makes at that speed (the power curve). The energy comes from where tall bars meet the rising line.",
  compl: "Do wind and solar fill each other's gaps? A negative correlation means a hybrid smooths supply and displaces more diesel. Descriptive — the correlation is reported, not turned into a verdict.",
};

// Cited reference thresholds (see README → References). These are standard figures, not
// invented: the tool reports against them and never pronounces a verdict.
const OP_TEMP_MIN = -10; // °C — below this a standard turbine needs a cold-climate package
const PR = 0.75;         // PV performance ratio (losses, temperature, soiling)
const CO2_PER_L = 2.68;  // kg CO₂ per litre of diesel burned
const R_AIR = 287.05;    // J/(kg·K), specific gas constant for dry air
const RHO_STD = 1.225;   // kg/m³ at 15 °C, sea level
const ICE_RH = 90;       // % — icing needs cold AND moist air, not just sub-zero

const SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function nums(rows: DataRow[], key: string): number[] {
  const out: number[] = [];
  for (const r of rows) { const v = r[key]; if (typeof v === "number") out.push(v); }
  return out;
}
function pct(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0;
}
function mean(a: number[]): number { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function std(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}

/** Polar wedge path (compass bearings: 0°=N at top, clockwise). */
function wedge(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const xy = (rr: number, deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  };
  const [x0, y0] = xy(r, a0);
  const [x1, y1] = xy(r, a1);
  return `M ${cx} ${cy} L ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`;
}

function WindRose({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  const cx = 110, cy = 110, R = 92;
  return (
    <svg viewBox="0 0 220 220" className="windrose" role="img" aria-label="Wind direction frequency">
      {[0.33, 0.66, 1].map((f) => (
        <circle key={f} cx={cx} cy={cy} r={R * f} fill="none" stroke="#e6edf5" />
      ))}
      {counts.map((c, i) => {
        const bearing = i * 45;
        const r = (c / max) * R;
        if (r < 1) return null;
        return <path key={i} d={wedge(cx, cy, r, bearing - 22.5, bearing + 22.5)} fill="#0e7490" fillOpacity={0.55} stroke="#0e7490" strokeWidth={0.75} />;
      })}
      {SECTORS.map((s, i) => {
        const a = ((i * 45 - 90) * Math.PI) / 180;
        const lr = R + 12;
        return (
          <text key={s} x={cx + lr * Math.cos(a)} y={cy + lr * Math.sin(a)} fontSize="10" fill="#64748b" textAnchor="middle" dominantBaseline="middle">{s}</text>
        );
      })}
    </svg>
  );
}

export function ResourcePanel({ result }: { result: ApiResponse }) {
  // Economic assumptions — user-adjustable; the estimate is a transparent calculation, not
  // a fixed verdict. Defaults sized for a small base installation.
  // Solar is an opt-in extension: the system is about wind turbines, so the default view is
  // wind-only and the user can add solar to model a hybrid.
  const [includeSolar, setIncludeSolar] = useState(false);
  const [turbineKW, setTurbineKW] = useState(10);   // wind turbine rating
  const [solarKWp, setSolarKWp] = useState(5);       // PV array size
  const [dieselLkWh, setDieselLkWh] = useState(0.3); // genset fuel use
  const [dieselPrice, setDieselPrice] = useState(3); // €/L delivered to Antarctica
  const [capex, setCapex] = useState(60000);         // system cost, for an indicative payback

  const rows = result.data;
  const aggregated = result.aggregation !== "None";
  const k = (base: string) => (aggregated ? `${base} mean` : base);

  const wind = nums(rows, k("Speed (m/s)"));
  if (!wind.length) {
    return <p className="hint">Include <strong>wind speed</strong> in the query to see the resource summary.</p>;
  }

  const temps = nums(rows, k("Temperature (ºC)"));
  const dirs = nums(rows, "Wind direction (°)");
  const press = nums(rows, k("Pressure (hpa)"));

  const n = wind.length;
  const below = wind.filter((v) => v < CUT_IN).length;
  const inBand = wind.filter((v) => v >= CUT_IN && v <= CUT_OUT).length;
  const above = wind.filter((v) => v > CUT_OUT).length;
  const avgWind = mean(wind);
  const cv = avgWind ? Math.round((std(wind) / avgWind) * 100) : 0;

  // Direction frequency into 8 compass sectors.
  const rose = new Array(8).fill(0);
  for (const d of dirs) rose[Math.round(((d % 360) + 360) % 360 / 45) % 8]++;

  // Air density ρ = P/(R·T): cold, dense Antarctic air boosts power vs the 1.225 standard.
  let densityNote: string | null = null;
  let densityRatio = 1; // ρ/ρ_std, used to density-correct the capacity factor
  if (press.length && temps.length) {
    const rho: number[] = [];
    const m = Math.min(press.length, temps.length);
    for (let i = 0; i < m; i++) rho.push((press[i] * 100) / (R_AIR * (temps[i] + 273.15)));
    const avgRho = mean(rho);
    densityRatio = avgRho / RHO_STD;
    densityNote = `${avgRho.toFixed(3)} kg/m³ (${avgRho >= RHO_STD ? "+" : ""}${Math.round((densityRatio - 1) * 100)}% vs standard)`;
  }

  // Data completeness: received 10-min readings vs expected over the returned window.
  const received = aggregated ? nums(rows, "Samples").reduce((a, b) => a + b, 0) : n;
  const times = rows.map((r) => Date.parse(String(r.Datetime))).filter((t) => !Number.isNaN(t));
  const spanMin = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 60000 : 0;
  const expected = spanMin > 0 ? spanMin / 10 + 1 : received;
  const completeness = Math.min(100, Math.round((received / expected) * 100));

  // Solar resource (radWM2): opens a wind + solar HYBRID to cut diesel further. Mean
  // irradiance and an indicative daily insolation (mean W/m² × 24h) — the standard metric.
  const solar = nums(rows, "Solar irradiance (W/m²)");
  const avgSolar = solar.length ? mean(solar) : null;
  const dailyInsol = avgSolar !== null ? (avgSolar * 24) / 1000 : null; // kWh/m²/day
  const solarAvailable = avgSolar !== null;      // the source has solar data
  const showSolar = includeSolar && solarAvailable; // ...and the user opted into the hybrid

  // Direction steadiness (dddstd): average spread of wind direction — lower = steadier siting.
  const dirStd = nums(rows, "Direction variability (°)");
  const avgDirStd = dirStd.length ? mean(dirStd) : null;

  // Icing risk refined with humidity: cold AND moist (temp < 0 °C and RH > 90%), not just cold.
  let icing: number | null = null;
  {
    let total = 0, iced = 0;
    for (const r of rows) {
      const t = r[k("Temperature (ºC)")]; const h = r["Humidity (%)"];
      if (typeof t !== "number" || typeof h !== "number") continue;
      total++; if (t < 0 && h > ICE_RH) iced++;
    }
    icing = total ? Math.round((iced / total) * 100) : null;
  }

  // --- Economic estimate (hybrid wind + solar). Energy is computed over the period span. ---
  const periodHours = spanMin / 60;
  const periodDays = periodHours / 24;
  const cf = capacityFactor(wind, densityRatio);          // wind capacity factor (0–1), density-corrected
  const cfBase = capacityFactor(wind);                    // …at standard density, to show the uplift
  const densityUplift = cfBase > 0 ? Math.round((cf / cfBase - 1) * 100) : 0;
  const windKWh = cf * turbineKW * periodHours;           // E = CF × rated × hours
  const solarKWh = includeSolar ? (dailyInsol ?? 0) * solarKWp * PR * periodDays : 0; // only when the hybrid is enabled
  const totalKWh = windKWh + solarKWh;
  const dieselL = totalKWh * dieselLkWh;                  // litres a genset would have burned
  const costSaved = dieselL * dieselPrice;
  const co2 = dieselL * CO2_PER_L;
  const payback = costSaved > 0 ? capex / costSaved : null; // in "campaigns like this one"
  const windPct = totalKWh > 0 ? Math.round((windKWh / totalKWh) * 100) : 0;
  const solarPct = totalKWh > 0 ? 100 - windPct : 0;
  const fmt0 = (x: number) => Math.round(x).toLocaleString();

  const basis = aggregated
    ? `${n} ${result.aggregation.toLowerCase()} buckets (query with aggregation = None for reading-level precision)`
    : `${n.toLocaleString()} × 10-min readings`;

  return (
    <div className="resource">
      <p className="resource-intro">
        How suitable is this site's <strong>wind</strong> resource for generation that would reduce the base's
        diesel use? Figures below are descriptive, measured against standard references — not an engineering verdict.
        {solarAvailable && " Solar is available in the data: enable the hybrid to add it."}
      </p>

      {solarAvailable && (
        <label className="solar-toggle">
          <input type="checkbox" checked={includeSolar} onChange={(e) => setIncludeSolar(e.target.checked)} />
          <span className="solar-switch"><span className="solar-knob" /></span>
          Add solar — model a <strong>wind + solar hybrid</strong>
        </label>
      )}

      <div className="report-headline">
        <span>Mean wind <b>{avgWind.toFixed(1)} m/s</b></span>
        <span><b>{pct(inBand, n)}%</b> of time in the productive band</span>
        <span>Wind capacity factor <b>~{Math.round(cf * 100)}%</b></span>
        {showSolar && <span>Solar <b>{dailyInsol!.toFixed(1)} kWh/m²·day</b></span>}
      </div>

      <h3 className="section-title">Resource summary</h3>
      <div className="resource-grid">
        <div className="res-card">
          <div className="res-label">Time in productive band <InfoTip text={INFO.band} /></div>
          <div className="res-big">{pct(inBand, n)}%</div>
          <div className="band-bar">
            <span className="seg below" style={{ width: `${pct(below, n)}%` }} title={`Below cut-in: ${pct(below, n)}%`} />
            <span className="seg in" style={{ width: `${pct(inBand, n)}%` }} title={`In band: ${pct(inBand, n)}%`} />
            <span className="seg above" style={{ width: `${pct(above, n)}%` }} title={`Above cut-out: ${pct(above, n)}%`} />
          </div>
          <div className="band-legend">
            <span><i className="dot below" /> below {CUT_IN} m/s · {pct(below, n)}%</span>
            <span><i className="dot in" /> {CUT_IN}–{CUT_OUT} m/s · {pct(inBand, n)}%</span>
            <span><i className="dot above" /> &gt;{CUT_OUT} m/s · {pct(above, n)}%</span>
          </div>
        </div>

        <div className="res-card rose-card">
          <div className="res-label">Prevailing wind direction <InfoTip text={INFO.rose} /></div>
          {dirs.length ? <WindRose counts={rose} /> : <p className="hint small">No direction data.</p>}
          {avgDirStd !== null && <div className="rose-caption">Variability ±{Math.round(avgDirStd)}° · lower = steadier</div>}
        </div>

        {showSolar && (
          <div className="res-card">
            <div className="res-label">Solar resource <InfoTip text={INFO.solar} /></div>
            <div className="res-big">{dailyInsol!.toFixed(1)}<span className="res-unit"> kWh/m²·day</span></div>
            <div className="band-legend">
              <span>Mean irradiance · {Math.round(avgSolar)} W/m²</span>
              <span>Supports a <strong>wind + solar hybrid</strong> — austral-summer daylight is near-continuous.</span>
            </div>
          </div>
        )}

        <div className="res-stats">
          <div className="res-stat"><span>Mean wind <InfoTip text={INFO.meanWind} /></span><b>{avgWind.toFixed(1)} m/s</b></div>
          <div className="res-stat"><span>Steadiness (CV) <InfoTip text={INFO.cv} /></span><b>{cv}%</b><em>lower is steadier</em></div>
          {temps.length > 0 && (
            <div className="res-stat"><span>Below freezing <InfoTip text={INFO.freezing} /></span><b>{pct(temps.filter((t) => t < 0).length, temps.length)}%</b></div>
          )}
          {icing !== null && (
            <div className="res-stat"><span>Icing risk (≤0°C &amp; RH&gt;{ICE_RH}%) <InfoTip text={INFO.icing} /></span><b>{icing}%</b></div>
          )}
          {temps.length > 0 && (
            <div className="res-stat"><span>Below {OP_TEMP_MIN}°C (needs cold pkg.) <InfoTip text={INFO.coldPkg} /></span><b>{pct(temps.filter((t) => t < OP_TEMP_MIN).length, temps.length)}%</b></div>
          )}
          {densityNote && <div className="res-stat"><span>Avg air density <InfoTip text={INFO.density} /></span><b>{densityNote.split(" (")[0]}</b><em>{densityNote.split("(")[1]?.replace(")", "")}</em></div>}
          <div className="res-stat"><span>Data completeness <InfoTip text={INFO.completeness} /></span><b>{completeness}%</b><em>{received.toLocaleString()} readings</em></div>
        </div>
      </div>

      <h3 className="section-title">Power curve &amp; wind distribution <InfoTip text={INFO.powercurve} /></h3>
      <div className="res-card wide">
        <PowerCurveChart winds={wind} />
        {densityNote && densityUplift !== 0 && (
          <p className="density-link">
            Cold, dense air (ρ = P/RT · {densityNote}) shifts this curve: it lifts the wind capacity factor from{" "}
            <b>{Math.round(cfBase * 100)}%</b> to <b>{Math.round(cf * 100)}%</b> ({densityUplift > 0 ? "+" : ""}{densityUplift}%).
            This is how <strong>pressure and temperature</strong> enter the turbine's operating thresholds.
          </p>
        )}
      </div>

      {showSolar && (
        <>
          <h3 className="section-title">Wind–solar complementarity <InfoTip text={INFO.compl} /></h3>
          <div className="res-card wide">
            <ComplementarityChart rows={rows} aggregated={aggregated} />
          </div>
        </>
      )}

      <h3 className="section-title">Economic estimate</h3>
      <div className="econ">
        {/* Hero takeaway — the one-sentence conclusion. */}
        <p className="econ-hero">
          Over this period, a <b>{turbineKW} kW</b> turbine{showSolar && <> + <b>{solarKWp} kWp</b> of solar</>} could
          generate <b> ~{fmt0(totalKWh)} kWh</b>, displacing <b>~{fmt0(dieselL)} L</b> of diesel
          (<b>~€{fmt0(costSaved)}</b> and <b>{fmt0(co2)} kg</b> CO₂).
        </p>

        {/* Scenario presets — one click to size the system. */}
        <div className="econ-presets">
          <span className="econ-sub">Scenario</span>
          <button type="button" onClick={() => { setTurbineKW(6); setSolarKWp(3); }}>Small</button>
          <button type="button" onClick={() => { setTurbineKW(15); setSolarKWp(10); }}>Medium</button>
          <button type="button" onClick={() => { setTurbineKW(30); setSolarKWp(20); }}>Large</button>
        </div>

        {/* Sliders for the most-touched assumptions. */}
        <div className="econ-sliders">
          <label>Wind turbine <b>{turbineKW} kW</b>
            <input type="range" min={0} max={50} step={1} value={turbineKW} onChange={(e) => setTurbineKW(+e.target.value)} />
          </label>
          {showSolar && (
            <label>Solar PV <b>{solarKWp} kWp</b>
              <input type="range" min={0} max={30} step={1} value={solarKWp} onChange={(e) => setSolarKWp(+e.target.value)} />
            </label>
          )}
          <label>Diesel price <b>€{dieselPrice.toFixed(1)}/L</b>
            <input type="range" min={0} max={8} step={0.5} value={dieselPrice} onChange={(e) => setDieselPrice(+e.target.value)} />
          </label>
        </div>
        <div className="econ-inputs">
          <label>Diesel use (L/kWh)
            <input type="number" min={0} step={0.05} value={dieselLkWh} onChange={(e) => setDieselLkWh(+e.target.value)} />
          </label>
          <label>System cost (€)
            <input type="number" min={0} step={1000} value={capex} onChange={(e) => setCapex(+e.target.value)} />
          </label>
        </div>

        {/* Energy mix: the wind/solar split of the hybrid at a glance (only when solar is on). */}
        {showSolar && (
          <div className="energy-mix">
            <div className="mix-label">Energy mix · {fmt0(totalKWh)} kWh</div>
            <div className="mix-bar">
              <span className="mix-seg wind" style={{ width: `${windPct}%` }} title={`Wind ${windPct}%`} />
              <span className="mix-seg solar" style={{ width: `${solarPct}%` }} title={`Solar ${solarPct}%`} />
            </div>
            <div className="mix-legend">
              <span><i className="dot wind" /> Wind · {fmt0(windKWh)} kWh ({windPct}%)</span>
              <span><i className="dot solar" /> Solar · {fmt0(solarKWh)} kWh ({solarPct}%)</span>
            </div>
          </div>
        )}

        <div className="econ-results">
          <div className="econ-card"><span>Wind capacity factor <InfoTip text={INFO.cf} /></span><b>{Math.round(cf * 100)}%</b>{densityUplift > 0 && <em>+{densityUplift}% from air density</em>}</div>
          <div className="econ-card"><span>Diesel displaced <InfoTip text={INFO.diesel} /></span><b>{fmt0(dieselL)} L</b></div>
          <div className="econ-card"><span>Cost avoided <InfoTip text={INFO.cost} /></span><b>€{fmt0(costSaved)}</b></div>
          <div className="econ-card"><span>CO₂ avoided <InfoTip text={INFO.co2} /></span><b>{fmt0(co2)} kg</b></div>
          {payback !== null && <div className="econ-card"><span>Indicative payback <InfoTip text={INFO.payback} /></span><b>{payback.toFixed(1)}</b><em>campaigns like this</em></div>}
        </div>
      </div>

      <p className="resource-foot">
        Based on {basis}. The economic figures are a <strong>transparent model driven by the inputs above</strong>
        (power-curve capacity factor; PV at performance ratio {PR}; {CO2_PER_L} kg CO₂/L) — indicative
        decision-support, not a quote. Thresholds (cut-in {CUT_IN} / rated ~{RATED} / cut-out {CUT_OUT} m/s; −10 °C
        operating limit; 1.225 kg/m³ standard density) are standard references cited in the README.
      </p>
    </div>
  );
}
