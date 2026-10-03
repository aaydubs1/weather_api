import { useState } from "react";
import type { ApiResponse, DataRow } from "../types";
import { CUT_IN, CUT_OUT, HOURS_PER_YEAR, RATED, capacityFactor, lcoe, powerFraction } from "../feasibility";
import { InfoTip } from "./InfoTip";
import { PowerCurveChart } from "./PowerCurveChart";
import { EconomicsChart, type EconPoint } from "./EconomicsChart";
import { OperatingStateChart, type StateSlice } from "./OperatingStateChart";
import { ThresholdScatter, type ScatterGroup, type ScatterPoint } from "./ThresholdScatter";
import { SensitivityTornado, type TornadoRow } from "./SensitivityTornado";

// Short, defensible explanations surfaced via the "i" tooltips.
const INFO = {
  band: "Share of the period the wind sits in a turbine's productive range (3–25 m/s): above the cut-in speed and below the cut-out shutdown speed.",
  rose: "How often the wind blows from each compass sector. A dominant, steady direction is better for siting a turbine.",
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
  payback: "Simple payback: system cost ÷ net yearly saving (fuel avoided − O&M). Annualised — it assumes this period's wind resource holds year-round.",
  lcoe: "Levelized cost of energy: the all-in cost per kWh over the system's life — capex spread with a discount rate (via the capital recovery factor) plus yearly O&M, divided by the energy produced each year. The standard way feasibility tools compare one source against another.",
  lcoeMargin: "Diesel's fuel cost per kWh minus wind's levelized cost. Positive = each wind kWh is cheaper than burning diesel for it. Diesel's figure is fuel only (excludes genset capex & upkeep), so the real gap is wider.",
  tornado: "How far the payback moves when each uncertain input is varied ±30% on its own, everything else held at base. Longer bars = the assumptions the decision depends on most — where to firm up numbers before committing.",
  financial: "Economic life and discount rate used to levelize the capex. O&M is taken at 2%/yr of system cost. Standard pre-feasibility defaults — adjust to your own.",
  powercurve: "Blue bars: how often the wind blows at each speed over the period. Green line: the share of rated power a turbine makes at that speed (the power curve). The energy comes from where tall bars meet the rising line.",
  opstate: "The turbine's state over the period, from its operating thresholds: generating when wind is in the 3–25 m/s band and temperature is within limits; otherwise stopped — too weak (below cut-in), storm (above cut-out), or cold/icing. The 'generating' share is the technical side of viability; it drives the capacity factor and the savings below.",
  econchart: "Cost avoided across the selected days: bars are each day's saving, the line is the running cumulative total. The tooltip breaks down energy, diesel and CO₂ (per day and cumulative). It updates live with the date range and the sliders.",
};

// Cited reference thresholds (see README → References). These are standard figures, not
// invented: the tool reports against them and never pronounces a verdict.
const OP_TEMP_MIN = -10; // °C — below this a standard turbine needs a cold-climate package
const CO2_PER_L = 2.68;  // kg CO₂ per litre of diesel burned
const R_AIR = 287.05;    // J/(kg·K), specific gas constant for dry air
const RHO_STD = 1.225;   // kg/m³ at 15 °C, sea level
const ICE_RH = 90;       // % — icing needs cold AND moist air, not just sub-zero
const OPEX_PCT = 0.02;   // annual O&M as a share of system cost (pre-feasibility default)
const SWING = 30;        // ± % applied to each input in the sensitivity tornado

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
  const [turbineKW, setTurbineKW] = useState(10);   // wind turbine rating
  const [dieselLkWh, setDieselLkWh] = useState(0.3); // genset fuel use
  const [dieselPrice, setDieselPrice] = useState(3); // €/L delivered to Antarctica
  const [capex, setCapex] = useState(60000);         // system cost, for an indicative payback
  const [lifetime, setLifetime] = useState(20);      // yr — economic life, to levelize the capex
  const [discount, setDiscount] = useState(5);       // % — discount rate for the LCOE

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

  // --- Economic estimate (wind). Energy is computed over the period span. ---
  const periodHours = spanMin / 60;
  const cf = capacityFactor(wind, densityRatio);          // wind capacity factor (0–1), density-corrected
  const cfBase = capacityFactor(wind);                    // …at standard density, to show the uplift
  const densityUplift = cfBase > 0 ? Math.round((cf / cfBase - 1) * 100) : 0;
  const totalKWh = cf * turbineKW * periodHours;          // E = CF × rated × hours
  const dieselL = totalKWh * dieselLkWh;                  // litres a genset would have burned
  const costSaved = dieselL * dieselPrice;
  const co2 = dieselL * CO2_PER_L;
  const fmt0 = (x: number) => Math.round(x).toLocaleString();

  // --- Annualised economics + levelized cost (the decision metrics). ---
  // Extrapolate this period's capacity factor to a full year. Antarctic stations report mainly
  // in the austral summer, so this is an "if the resource held year-round" figure — flagged as
  // such in the tooltips; it keeps the LCOE and payback on a standard yearly basis.
  const annualKWh = cf * turbineKW * HOURS_PER_YEAR;
  const annualOpex = OPEX_PCT * capex;
  const annualSaving = annualKWh * dieselLkWh * dieselPrice;     // fuel cost avoided per year
  const netAnnual = annualSaving - annualOpex;
  const payback = netAnnual > 0 ? capex / netAnnual : null;      // simple payback, in years
  const windLcoe = lcoe(capex, annualOpex, annualKWh, discount / 100, lifetime); // €/kWh
  const dieselLcoe = dieselLkWh * dieselPrice;                   // €/kWh, fuel-only floor
  const lcoeMargin = dieselLcoe - windLcoe;                      // €/kWh wind saves vs diesel
  const lcoeMax = Math.max(windLcoe, dieselLcoe) || 1;           // for the comparison bars

  // Sensitivity: payback (yr) when each uncertain input is moved ±SWING%, others held at base.
  const paybackAt = (dPriceMul: number, capMul: number, cfMul: number, lkwhMul: number): number => {
    const cap = capex * capMul;
    const energy = cf * cfMul * turbineKW * HOURS_PER_YEAR;
    const net = energy * (dieselLkWh * lkwhMul) * (dieselPrice * dPriceMul) - OPEX_PCT * cap;
    return net > 0 ? cap / net : Infinity;
  };
  const lo = 1 - SWING / 100, hi = 1 + SWING / 100;
  const tornado: TornadoRow[] = payback !== null ? [
    { factor: "Diesel price", minus: paybackAt(lo, 1, 1, 1), plus: paybackAt(hi, 1, 1, 1) },
    { factor: "Wind resource", minus: paybackAt(1, 1, lo, 1), plus: paybackAt(1, 1, hi, 1) },
    { factor: "System cost", minus: paybackAt(1, lo, 1, 1), plus: paybackAt(1, hi, 1, 1) },
    { factor: "Diesel use (L/kWh)", minus: paybackAt(1, 1, 1, lo), plus: paybackAt(1, 1, 1, hi) },
  ].filter((r) => Number.isFinite(r.minus) && Number.isFinite(r.plus)) : [];

  // Operating-state breakdown from the turbine's thresholds, using all the factors per
  // reading: wind speed (cut-in/cut-out band) + temperature (cold limit) + icing (sub-zero &
  // humid). The "generating" share is the technical side of viability.
  let gen = 0, weak = 0, storm = 0, cold = 0, opTotal = 0;
  const genPts: ScatterPoint[] = [], weakPts: ScatterPoint[] = [], stormPts: ScatterPoint[] = [], coldPts: ScatterPoint[] = [];
  for (const r of rows) {
    const w = r[k("Speed (m/s)")];
    if (typeof w !== "number") continue;
    opTotal++;
    const t = r[k("Temperature (ºC)")];
    const h = r["Humidity (%)"];
    const pt: ScatterPoint | null = typeof t === "number"
      ? { wind: w, temp: t, when: String(r.Datetime), rh: typeof h === "number" ? h : null }
      : null;
    if (w < CUT_IN) { weak++; if (pt) weakPts.push(pt); continue; }
    if (w > CUT_OUT) { storm++; if (pt) stormPts.push(pt); continue; }
    const tooCold = typeof t === "number" && t < OP_TEMP_MIN;
    const ice = typeof t === "number" && typeof h === "number" && t < 0 && h > ICE_RH;
    if (tooCold || ice) { cold++; if (pt) coldPts.push(pt); continue; }
    gen++; if (pt) genPts.push(pt);
  }
  const opPct = (x: number) => (opTotal ? Math.round((x / opTotal) * 100) : 0);
  const generatingPct = opPct(gen);
  const opStateData: StateSlice[] = [
    { name: "Generating", value: generatingPct, color: "#0e7490", rule: `${CUT_IN}–${CUT_OUT} m/s · ≥ ${OP_TEMP_MIN}°C` },
    { name: "Idle — below cut-in", value: opPct(weak), color: "#cbd5e1", rule: `< ${CUT_IN} m/s` },
    { name: "Stopped — storm (cut-out)", value: opPct(storm), color: "#1e293b", rule: `> ${CUT_OUT} m/s` },
    { name: "Stopped — cold / icing", value: opPct(cold), color: "#60c5f1", rule: `< ${OP_TEMP_MIN}°C or ≤0°C & humid` },
  ].filter((s) => s.value > 0);
  // Downsample each state's points for a light scatter (the derivation of those %).
  const ds = (a: ScatterPoint[]) => (a.length > 400 ? a.filter((_, i) => i % Math.ceil(a.length / 400) === 0) : a);
  const scatterGroups: ScatterGroup[] = [
    { name: "Generating", color: "#0e7490", points: ds(genPts) },
    { name: "Below cut-in", color: "#94a3b8", points: ds(weakPts) },
    { name: "Storm", color: "#1e293b", points: ds(stormPts) },
    { name: "Cold / icing", color: "#60c5f1", points: ds(coldPts) },
  ].filter((g) => g.points.length > 0);

  // Economics over the selected days, bucketed by calendar day (month for a Monthly query),
  // integrating each reading's wind output via the density-corrected power curve, then a
  // cumulative total. Updates live with the range and the sliders.
  const stepH = rows.length > 0 ? periodHours / rows.length : 0;
  const econGranularity: "day" | "month" = result.aggregation === "Monthly" ? "month" : "day";
  const keyLen = econGranularity === "month" ? 7 : 10;
  const perBucket = new Map<string, number>(); // bucket key -> kWh
  const bucketOrder: string[] = [];
  for (const r of rows) {
    const key = String(r.Datetime).slice(0, keyLen);
    const w = r[k("Speed (m/s)")];
    const kwh = typeof w === "number" ? Math.min(1, powerFraction(w) * densityRatio) * turbineKW * stepH : 0;
    if (!perBucket.has(key)) { perBucket.set(key, 0); bucketOrder.push(key); }
    perBucket.set(key, perBucket.get(key)! + kwh);
  }
  let cumKwh = 0;
  const econChartData: EconPoint[] = bucketOrder.map((key) => {
    const dayKwh = perBucket.get(key)!;
    cumKwh += dayKwh;
    const dayDiesel = dayKwh * dieselLkWh;
    const cumDiesel = cumKwh * dieselLkWh;
    return {
      Datetime: econGranularity === "month" ? `${key}-01T00:00:00` : `${key}T00:00:00`,
      dayKwh, dayDiesel, dayCost: dayDiesel * dieselPrice, dayCo2: dayDiesel * CO2_PER_L,
      cumKwh, cumDiesel, cumCost: cumDiesel * dieselPrice, cumCo2: cumDiesel * CO2_PER_L,
    };
  });

  const basis = aggregated
    ? `${n} ${result.aggregation.toLowerCase()} buckets (query with aggregation = None for reading-level precision)`
    : `${n.toLocaleString()} × 10-min readings`;

  return (
    <div className="resource">
      <div className="report-headline" id="tour-headline">
        <span>Technical — <b>{generatingPct}%</b> of time generating</span>
        {Number.isFinite(windLcoe)
          ? <span>Economic — wind <b>€{windLcoe.toFixed(2)}/kWh</b> vs diesel €{dieselLcoe.toFixed(2)}</span>
          : <span>Economic — capacity factor <b>~{Math.round(cf * 100)}%</b></span>}
        <span>Mean wind <b>{avgWind.toFixed(1)} m/s</b></span>
      </div>

      <h2 className="viability-title">1 · Technical viability — does the turbine run enough?</h2>

      <h3 className="section-title">Turbine operating thresholds <InfoTip text={INFO.opstate} /></h3>
      <div className="res-card wide" id="tour-technical">
        <OperatingStateChart data={opStateData} generatingPct={generatingPct} />
        {scatterGroups.length > 0 && <ThresholdScatter groups={scatterGroups} opTempMin={OP_TEMP_MIN} />}
        {aggregated && <p className="caveat-line">Classified from {result.aggregation.toLowerCase()} means — use aggregation = None for reading-level accuracy.</p>}
      </div>

      <h3 className="section-title">Resource summary</h3>
      <div className="resource-grid" id="tour-resource">
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
      <div className="res-card wide" id="tour-powercurve">
        <PowerCurveChart winds={wind} />
      </div>

      <h2 className="viability-title" id="tour-economic">2 · Economic viability — does it pay off?</h2>

      <h3 className="section-title">Economic estimate</h3>
      <div className="econ">
        <p className="econ-hero">
          A <b>{turbineKW} kW</b> turbine → <b>~{fmt0(totalKWh)} kWh</b>, <b>~{fmt0(dieselL)} L</b> diesel,
          <b> ~€{fmt0(costSaved)}</b>, <b>{fmt0(co2)} kg</b> CO₂.
        </p>

        <div className="econ-presets">
          <span className="econ-sub">Scenario</span>
          <button type="button" onClick={() => setTurbineKW(6)}>Small</button>
          <button type="button" onClick={() => setTurbineKW(15)}>Medium</button>
          <button type="button" onClick={() => setTurbineKW(30)}>Large</button>
        </div>

        {/* Sliders for the most-touched assumptions. */}
        <div className="econ-sliders">
          <label>Wind turbine <b>{turbineKW} kW</b>
            <input type="range" min={0} max={50} step={1} value={turbineKW} onChange={(e) => setTurbineKW(+e.target.value)} />
          </label>
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
          <label>Economic life (yr) <InfoTip text={INFO.financial} />
            <input type="number" min={1} step={1} value={lifetime} onChange={(e) => setLifetime(+e.target.value)} />
          </label>
          <label>Discount rate (%)
            <input type="number" min={0} step={0.5} value={discount} onChange={(e) => setDiscount(+e.target.value)} />
          </label>
        </div>

        {/* THE decision metric: levelized cost of energy, wind vs the diesel it replaces. */}
        <div className="lcoe">
          <div className="mix-label">Levelized cost of energy — wind vs diesel <InfoTip text={INFO.lcoe} /></div>
          {Number.isFinite(windLcoe) ? (
            <>
              <div className="lcoe-row">
                <span className="lcoe-name">Wind (this project)</span>
                <div className="lcoe-track"><span className="lcoe-fill wind" style={{ width: `${(windLcoe / lcoeMax) * 100}%` }} /></div>
                <b className="lcoe-val">€{windLcoe.toFixed(2)}</b>
              </div>
              <div className="lcoe-row">
                <span className="lcoe-name">Diesel (fuel only)</span>
                <div className="lcoe-track"><span className="lcoe-fill diesel" style={{ width: `${(dieselLcoe / lcoeMax) * 100}%` }} /></div>
                <b className="lcoe-val">€{dieselLcoe.toFixed(2)}</b>
              </div>
              <p className={lcoeMargin > 0 ? "lcoe-read good" : "lcoe-read bad"}>
                {lcoeMargin > 0
                  ? <>Wind is <b>€{lcoeMargin.toFixed(2)}/kWh cheaper</b> than diesel — and diesel's figure ignores genset capex &amp; upkeep, so the real gap is wider. <InfoTip text={INFO.lcoeMargin} /></>
                  : <>Wind costs <b>€{(-lcoeMargin).toFixed(2)}/kWh more</b> than diesel fuel at these assumptions. <InfoTip text={INFO.lcoeMargin} /></>}
              </p>
            </>
          ) : (
            <p className="hint small">Set a turbine rating above 0 to compute the levelized cost.</p>
          )}
        </div>

        {/* Cumulative benefit over the chosen days. */}
        <div className="econ-chart">
          <div className="mix-label">Fuel cost avoided over the selected period <InfoTip text={INFO.econchart} /></div>
          <EconomicsChart data={econChartData} granularity={econGranularity} />
        </div>

        <div className="econ-results">
          <div className="econ-card"><span>Wind capacity factor <InfoTip text={INFO.cf} /></span><b>{Math.round(cf * 100)}%</b>{densityUplift > 0 && <em>+{densityUplift}% from air density</em>}</div>
          <div className="econ-card"><span>Diesel displaced <InfoTip text={INFO.diesel} /></span><b>{fmt0(dieselL)} L</b></div>
          <div className="econ-card"><span>Cost avoided <InfoTip text={INFO.cost} /></span><b>€{fmt0(costSaved)}</b><em>this period</em></div>
          <div className="econ-card"><span>CO₂ avoided <InfoTip text={INFO.co2} /></span><b>{fmt0(co2)} kg</b></div>
          {payback !== null && <div className="econ-card"><span>Simple payback <InfoTip text={INFO.payback} /></span><b>{payback.toFixed(1)} yr</b><em>annualised</em></div>}
        </div>

        {/* Risk / sensitivity — how robust the payback is to the uncertain inputs. */}
        {payback !== null && tornado.length > 0 && (
          <div className="econ-chart">
            <div className="mix-label">How robust is the payback? Sensitivity to ±{SWING}% on each input <InfoTip text={INFO.tornado} /></div>
            <SensitivityTornado data={tornado} base={payback} unit="yr" swing={SWING} />
          </div>
        )}
      </div>

      <div className="viability-read">
        <span><em>Technical</em> <b>{generatingPct}%</b> generating</span>
        {Number.isFinite(windLcoe)
          ? <span><em>Economic</em> wind <b>€{windLcoe.toFixed(2)}/kWh</b>{lcoeMargin > 0 ? <> · <b>€{lcoeMargin.toFixed(2)}</b> under diesel</> : <> · above diesel</>}{payback !== null && <> · payback ~<b>{payback.toFixed(0)} yr</b></>}</span>
          : <span><em>Economic</em> <b>€{fmt0(costSaved)}</b> avoided</span>}
        <span className="vr-note">Both gates must be adequate.</span>
      </div>

      <p className="resource-foot">
        Based on {basis}. Transparent model against cited references (cut-in {CUT_IN} / rated ~{RATED} / cut-out
        {CUT_OUT} m/s; −10 °C limit; 1.225 kg/m³) — decision-support, not a quote.
      </p>
    </div>
  );
}
