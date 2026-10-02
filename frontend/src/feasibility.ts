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

/**
 * Pearson correlation coefficient between two aligned series (e.g. wind vs solar for the
 * hybrid complementarity check). Returns null if undefined (fewer than 2 points, or a
 * constant series). Negative = the two tend to be strong at different times (complementary).
 */
export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  const den = Math.sqrt(da * db);
  return den ? num / den : null;
}
