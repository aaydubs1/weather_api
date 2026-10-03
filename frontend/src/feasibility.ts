// Shared wind power-curve model — used both by the economic estimate (capacity factor)
// and by the chart productivity overlay, so the logic lives in exactly one place.
// Thresholds are the standard references cited in the README.
export const CUT_IN = 3;    // m/s — turbine starts producing
export const RATED = 12;    // m/s — reaches rated (maximum) power
export const CUT_OUT = 25;  // m/s — shuts down for safety

/**
 * Fraction (0–1) of rated power a turbine produces at wind speed `v`.
 * Zero below cut-in and above cut-out; a cubic rise between cut-in and rated (power scales
 * with the cube of wind speed); flat at rated power up to cut-out.
 */
export function powerFraction(v: number): number {
  if (!Number.isFinite(v) || v < CUT_IN || v > CUT_OUT) return 0;
  if (v >= RATED) return 1;
  return (v ** 3 - CUT_IN ** 3) / (RATED ** 3 - CUT_IN ** 3);
}

/**
 * Capacity factor over a series of wind-speed readings: the average power fraction.
 * Computed per reading then averaged — never from the mean speed, because power is convex
 * in `v`, so using the mean would bias the result. (Aggregated data loses sub-bucket
 * variability, so None gives the most accurate figure.)
 *
 * `densityRatio` (ρ/ρ_std) density-corrects the output: power is proportional to air
 * density, so the cold, dense Antarctic air gives more power for the same wind. It only
 * lifts the sub-rated part of the curve — the turbine is still capped at rated power — so
 * the per-reading output is clamped to 1. Defaults to 1 (no correction).
 */
export function capacityFactor(winds: number[], densityRatio = 1): number {
  if (!winds.length) return 0;
  return winds.reduce((s, v) => s + Math.min(1, powerFraction(v) * densityRatio), 0) / winds.length;
}

export const HOURS_PER_YEAR = 8760;

/**
 * Capital recovery factor: turns an up-front capex into an equivalent level annual payment
 * over `years`, given an annual discount `rate` (e.g. 0.05). The standard finance formula
 * behind a levelized cost. At rate 0 it degrades to a straight-line 1/years.
 */
export function crf(rate: number, years: number): number {
  if (years <= 0) return 0;
  if (rate === 0) return 1 / years;
  const f = Math.pow(1 + rate, years);
  return (rate * f) / (f - 1);
}

/**
 * Levelized cost of energy (currency per kWh): the constant price per kWh that recovers the
 * capex (annualized via the CRF) plus yearly running cost, over the energy produced each year.
 * This is the metric wind-feasibility tools (RETScreen and the like) compare against the
 * alternative's cost per kWh — here, diesel. Returns Infinity when no energy is produced.
 */
export function lcoe(
  capex: number,
  annualOpex: number,
  annualEnergyKWh: number,
  rate: number,
  years: number,
): number {
  if (annualEnergyKWh <= 0) return Infinity;
  return (capex * crf(rate, years) + annualOpex) / annualEnergyKWh;
}
