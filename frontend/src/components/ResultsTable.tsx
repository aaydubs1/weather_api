import type { ApiResponse } from "../types";

function format(value: string | number | null): string {
  return value === null || value === undefined ? "—" : String(value);
}

export function ResultsTable({ result }: { result: ApiResponse }) {
  const rows = result.data;
  if (!rows.length) return null;
  const columns = Object.keys(rows[0]);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{columns.map((c) => <td key={c}>{format(row[c])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
