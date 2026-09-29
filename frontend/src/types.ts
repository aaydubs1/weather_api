export type Aggregation = "None" | "Hourly" | "Daily" | "Monthly";
export type MeasurementKey = "temperature" | "pressure" | "speed";

export interface Station {
  key: string;
  id: string;
  name: string;
}

export type DataRow = Record<string, string | number | null>;

export interface ApiResponse {
  station: string;
  aggregation: string;
  timezone: string;
  count: number;
  data: DataRow[];
}

export interface QueryParams {
  station: string;
  start: string; // YYYY-MM-DDTHH:MM:SS
  end: string;
  aggregation: Aggregation;
  measurements: MeasurementKey[];
}
