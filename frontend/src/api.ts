import type { ApiResponse, QueryParams, Station } from "./types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export async function fetchStations(): Promise<Station[]> {
  const res = await fetch(`${BASE}/api/antartida/estaciones`);
  if (!res.ok) throw new Error("Could not load the list of stations");
  return res.json();
}

export async function fetchData(params: QueryParams): Promise<ApiResponse> {
  const path =
    `/api/antartida/datos/fechaini/${params.start}` +
    `/fechafin/${params.end}/estacion/${params.station}`;

  const query = new URLSearchParams();
  query.set("aggregation", params.aggregation);
  // Inputs are entered in the output time zone for a consistent, intuitive UX.
  query.set("location", "Europe/Madrid");
  params.measurements.forEach((m) => query.append("measurements", m));

  const res = await fetch(`${BASE}${path}?${query.toString()}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}
