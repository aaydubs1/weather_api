import type { ApiResponse } from "./types";

const LABELS = ["Temperature (ºC)", "Pressure (hpa)", "Speed (m/s)"];

export interface Extreme {
  value: number;
  datetime: string;
}

export interface MeasurementSummary {
  label: string;
  mean: number | null;
  highest: Extreme | null;
  lowest: Extreme | null;
}

function num(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/**
 * Derive a per-measurement summary from the response rows.
 * - mean: weighted by the number of raw samples in each bucket (so an aggregated
 *   series gives the same average as the raw data).
 * - highest / lowest: the real extremes observed in the range, with when they happened.
 */
export function summarize(result: ApiResponse): MeasurementSummary[] {
  const rows = result.data;
  if (!rows.length) return [];

  const first = rows[0];
  const aggregated = result.aggregation !== "None";
  const present = LABELS.filter((label) =>
    Object.keys(first).some((k) => k === label || k.startsWith(`${label} `))
  );

  return present.map((label) => {
    let weightedSum = 0;
    let weight = 0;
    let highest: Extreme | null = null;
    let lowest: Extreme | null = null;

    for (const row of rows) {
      const datetime = String(row["Datetime"]);
      if (aggregated) {
        const mean = num(row[`${label} mean`]);
        const samples = num(row["Samples"]) ?? 1;
        const max = num(row[`${label} max`]);
        const min = num(row[`${label} min`]);
        if (mean !== null) {
          weightedSum += mean * samples;
          weight += samples;
        }
        if (max !== null && (highest === null || max > highest.value)) highest = { value: max, datetime };
        if (min !== null && (lowest === null || min < lowest.value)) lowest = { value: min, datetime };
      } else {
        const value = num(row[label]);
        if (value !== null) {
          weightedSum += value;
          weight += 1;
          if (highest === null || value > highest.value) highest = { value, datetime };
          if (lowest === null || value < lowest.value) lowest = { value, datetime };
        }
      }
    }

    const mean = weight > 0 ? Math.round((weightedSum / weight) * 100) / 100 : null;
    return { label, mean, highest, lowest };
  });
}
