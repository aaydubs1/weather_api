import { useEffect, useMemo, useRef, useState } from "react";
import type { ApiResponse, DataRow } from "../types";

// Virtualization constants. A "None" query over a summer season is ~10-min data =
// tens of thousands of rows, so we render only the rows in view (plus a small overscan)
// and keep total scroll height with two spacer rows. Rows must have a FIXED height for
// the index math to hold; it is enforced in CSS (.vtable tbody tr).
const ROW_H = 33; // px, must match .vtable tbody tr height
const VIEW_H = 440; // px, must match .vtable max-height
const OVERSCAN = 8; // extra rows above/below the viewport to avoid blank edges on fast scroll

type Dir = "asc" | "desc";

function format(value: string | number | null): string {
  return value === null || value === undefined ? "—" : String(value);
}

/** A column is numeric if its first non-null value is a number (measurements) vs a
 *  string (Station, Datetime). Decides the comparator and the default sort direction. */
function isNumericColumn(rows: DataRow[], col: string): boolean {
  for (const r of rows) {
    const v = r[col];
    if (v === null || v === undefined) continue;
    return typeof v === "number";
  }
  return false;
}

export function ResultsTable({ result }: { result: ApiResponse }) {
  const rows = result.data;
  const columns = rows.length ? Object.keys(rows[0]) : [];

  const [sortCol, setSortCol] = useState<string | null>(null);
  const [dir, setDir] = useState<Dir>("asc");
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // A new dataset resets sorting and scroll position.
  useEffect(() => {
    setSortCol(null);
    setScrollTop(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [result]);

  const numericCols = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const c of columns) m[c] = isNumericColumn(rows, c);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const sorted = useMemo(() => {
    if (!sortCol) return rows;
    const numeric = numericCols[sortCol];
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      if (va === null || va === undefined) return 1; // nulls always last…
      if (vb === null || vb === undefined) return -1; // …regardless of direction
      const cmp = numeric
        ? (va as number) - (vb as number)
        : String(va).localeCompare(String(vb));
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortCol, dir, numericCols]);

  if (!rows.length) return null;

  function onHeaderClick(col: string) {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
    if (sortCol === col) {
      setDir((d) => (d === "asc" ? "desc" : "asc")); // same column -> flip direction
    } else {
      setSortCol(col);
      setDir(numericCols[col] ? "desc" : "asc"); // numbers default to highest-first
    }
  }

  // Visible window.
  const total = sorted.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(total, Math.ceil((scrollTop + VIEW_H) / ROW_H) + OVERSCAN);
  const visible = sorted.slice(start, end);
  const padTop = start * ROW_H;
  const padBottom = (total - end) * ROW_H;

  return (
    <>
      <div
        className="table-wrap vtable"
        ref={scrollRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        <table>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sortCol === c;
                return (
                  <th
                    key={c}
                    className={`sortable${active ? " active" : ""}`}
                    onClick={() => onHeaderClick(c)}
                    title="Click to sort"
                  >
                    <span className="th-label">{c}</span>
                    <span className="th-arrow">{active ? (dir === "asc" ? "▲" : "▼") : "⇅"}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr aria-hidden>
                <td className="vspace" colSpan={columns.length} style={{ height: padTop }} />
              </tr>
            )}
            {visible.map((row, i) => (
              <tr key={start + i}>
                {columns.map((c) => <td key={c}>{format(row[c])}</td>)}
              </tr>
            ))}
            {padBottom > 0 && (
              <tr aria-hidden>
                <td className="vspace" colSpan={columns.length} style={{ height: padBottom }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sortCol && (
        <div className="table-count">Sorted by “{sortCol}” ({dir === "asc" ? "ascending" : "descending"})</div>
      )}
    </>
  );
}
