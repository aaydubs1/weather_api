// Client-side export helpers. Data formats (CSV/JSON) and image formats (PNG/SVG) need
// no dependency; Excel loads SheetJS from a CDN on demand, so the app ships nothing extra
// and the library is only fetched if the user actually asks for .xlsx.
import type { ApiResponse } from "./types";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** A safe, descriptive file stem, e.g. "antartida_meteo_station_juan_carlos_i_daily". */
export function baseName(result: ApiResponse): string {
  return `antartida_${result.station}_${result.aggregation}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ---------- Data ----------

export function downloadCSV(result: ApiResponse) {
  const rows = result.data;
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(","));
  // Prepend a UTF-8 BOM so Excel opens accented headers (ºC) correctly.
  triggerDownload(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${baseName(result)}.csv`);
}

export function downloadJSON(result: ApiResponse) {
  triggerDownload(
    new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    `${baseName(result)}.json`
  );
}

let sheetJsPromise: Promise<any> | null = null;
function loadSheetJS(): Promise<any> {
  if ((window as any).XLSX) return Promise.resolve((window as any).XLSX);
  if (!sheetJsPromise) {
    sheetJsPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      s.onload = () => resolve((window as any).XLSX);
      s.onerror = () => { sheetJsPromise = null; reject(new Error("Could not load the Excel library (offline?)")); };
      document.head.appendChild(s);
    });
  }
  return sheetJsPromise;
}

export async function downloadXLSX(result: ApiResponse) {
  const XLSX = await loadSheetJS();
  const ws = XLSX.utils.json_to_sheet(result.data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, `${baseName(result)}.xlsx`);
}

// ---------- Charts (PNG / SVG) ----------

/** Clone the live Recharts <svg>, stamp explicit size and a white background (charts are
 *  transparent on screen), and serialize it. */
function serializeSvg(svg: SVGSVGElement): { data: string; width: number; height: number } {
  const rect = svg.getBoundingClientRect();
  const width = Math.round(svg.width?.baseVal?.value || rect.width);
  const height = Math.round(svg.height?.baseVal?.value || rect.height);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", String(width));
  bg.setAttribute("height", String(height));
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.firstChild);
  return { data: new XMLSerializer().serializeToString(clone), width, height };
}

function svgDataUrl(data: string): string {
  // encodeURIComponent + unescape keeps UTF-8 chars (ºC, m/s) valid inside btoa.
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(data)));
}

export function downloadChartSVG(svg: SVGSVGElement, name: string) {
  const { data } = serializeSvg(svg);
  triggerDownload(new Blob([data], { type: "image/svg+xml;charset=utf-8" }), `${name}.svg`);
}

export function downloadChartPNG(svg: SVGSVGElement, name: string, scale = 2) {
  const { data, width, height } = serializeSvg(svg);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => { if (blob) triggerDownload(blob, `${name}.png`); }, "image/png");
  };
  img.src = svgDataUrl(data);
}
