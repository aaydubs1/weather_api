# Design & Decision Log

> This document explains **how the problem was analysed** and **why** each decision
> was taken, before and while writing the code. It is deliberately written first:
> the goal is to show the reasoning, the trade-offs and the edge cases that were
> considered — not just the final implementation.

## 1. Understanding the real problem (not just the endpoint)

On the surface this is "wrap the AEMET API". But the *business* context matters and
it shaped several decisions:

- The Business Development team wants to assess the **feasibility of a wind farm in
  Antarctica**. They explicitly care about **wind patterns and temperature extremes**.
- **Implication:** when we aggregate (hourly / daily / monthly), returning only the
  **mean** would hide exactly what they need — the extremes. So the aggregation keeps
  `mean`, `min` and `max` (and a sample `count`) per bucket, not just the average.
  This is a small decision with real analytical value, and it is cheap to compute.
- The service will later receive **thousands of requests** (Part 2) and be **critical
  during business hours**, but the **source only updates a few times a day**. That
  asymmetry is the whole justification for the cache: the data is essentially
  immutable historical data, so caching is safe and high-impact.

## 2. Key technical challenges identified up front

1. **AEMET is a two-step API.** A request does **not** return the data; it returns a
   JSON envelope `{ estado, datos, metadatos }` where `datos` is a **second URL** that
   holds the real payload. We must chain the two calls, check `estado`, and handle the
   `latin-1 / ISO-8859-15` encoding AEMET uses.
2. **Time zones are the hard part** (the brief stresses it twice):
   - Input datetimes arrive in a **user-provided zone** (`location`, e.g. `Europe/Berlin`)
     or a fixed **offset** (`+02:00`).
   - AEMET timestamps (`fhora`) are in **UTC**.
   - The **output** must be in **Europe/Madrid (CET/CEST)** and include the offset,
     and must be **correct across DST** (`+01:00` in winter, `+02:00` in summer).
   - **Daily / monthly** aggregation must bucket by the **station's local calendar day
     / month**, not by UTC — otherwise a "day" is cut at the wrong instant.
3. **Aggregation semantics.** `None` = raw 10-min data untouched. `Hourly/Daily/Monthly`
   = resample. The bucket boundary and the bucket label time zone must be explicit.
4. **Not overloading the source** (Part 2) → cache with an explicit record of which
   time ranges have already been fetched, so we only ever ask AEMET for gaps.
5. **UX** (Part 3) → the interface must be understandable at a glance; the reviewer said
   this is very important.

## 3. Decisions and justifications

| Decision | Choice | Why |
|---|---|---|
| Backend framework | **FastAPI** | Async (good for chained I/O to AEMET), automatic **OpenAPI/Swagger** docs, **Pydantic** validation out of the box. The reviewer grades "knowledge of common Python packages". |
| HTTP client | **httpx (async)** | Native async, timeouts, retries; lets us chain the two AEMET calls without blocking. |
| Data processing | **pandas** | `resample` handles time aggregation cleanly and is the standard tool; makes min/max/mean trivial. |
| Time zones | **stdlib `zoneinfo`** (+ `tzdata`) | Standard, DST-aware, no heavy dependency. |
| Cache / storage | **SQLite via SQLAlchemy** | Required by Part 2. SQLAlchemy gives a clean data layer and parametrised queries (no SQL injection, easy to refactor to Postgres later). |
| Config / secrets | **pydantic-settings + `.env`** | API key lives in an **environment variable**, never in code (required). Typed config. |
| Frontend | **React + TypeScript + Vite**, chart with **Recharts** | TypeScript is requested; React is a strong fit for a small data explorer; Recharts for a simple, readable time-series chart. |
| Aggregation output | mean + min + max + count | The business case is about **extremes**; mean alone would hide them. |

## 4. Time-zone model (the part that is easy to get wrong)

We keep **one internal source of truth: UTC**.

1. Parse the user's `fechaIni/fechaFin` and localize them with the provided `location`
   or `offset`. Convert to **UTC** to query AEMET (AEMET path expects a UTC datetime).
2. AEMET rows come back in UTC → we hold everything in a **UTC-indexed** pandas frame.
3. **Aggregation**:
   - `None` / `Hourly`: bucket in UTC (an hour is an hour regardless of zone).
   - `Daily` / `Monthly`: **first convert the index to the station's local time zone**,
     then resample by calendar `D` / `MS`. This is what "considering the station's time
     zone" means — a day is the station's local day.
4. **Output**: convert every timestamp to **Europe/Madrid** and serialise with the
   offset (ISO 8601, e.g. `2023-07-01T14:00:00+02:00`). Because `zoneinfo` is DST-aware,
   a July timestamp serialises as `+02:00` and a January one as `+01:00` automatically.

**Station time-zone assumption (documented, not hidden):** the two Spanish Antarctic
bases sit on the South Shetland Islands. There is no single "official" civil zone, so we
use `Antarctica/Palmer` (UTC−03, no DST) as the station zone and expose it in config so
it can be changed. The important thing for the exercise is that daily/monthly buckets are
built on a **consistent local day**, and that the assumption is explicit. (See TODO.)

## 5. Edge cases considered

- `estado != 200` from AEMET (e.g. 404 "no data for range") → mapped to a clean HTTP
  error, not a 500.
- Empty result set → return `[]` with 200, not an error.
- Missing/`null` measurements in a bucket → excluded from mean/min/max (pandas skips NaN).
- Decimal comma vs dot in AEMET numeric strings → normalised on parse.
- `fechaIni > fechaFin`, or an invalid station id → 422 validation error before any call.
- DST boundary days → covered by an explicit unit test.
- Very large ranges → the cache + range-tracking prevents repeated source calls.

## 6. Alternatives considered and rejected

- **Flask** instead of FastAPI → rejected: no built-in async, validation or docs; FastAPI
  showcases more relevant Python knowledge for this brief.
- **Storing already-aggregated data** in the cache → rejected: we cache the **raw 10-min**
  rows so that *any* aggregation can be served from cache; aggregating on read keeps the
  cache generic.
- **A single AEMET call per user request without cache** → rejected by Part 2's own
  requirement (would overload the source under thousands of requests).
- **Returning only the mean** on aggregation → rejected (loses the extremes the business
  actually needs).

## 7. UX approach (Part 3)

The reviewer stressed that the interface must be understandable at a glance. The frontend
is not a thin wrapper over the API; each UX decision below was made to remove a specific
source of confusion. The guiding principle: **the interface should teach the user about
the data, not just display it.**

### 7.1 Search as a familiar, scannable header

The query controls (station → date range → aggregation → measurements) are laid out as a
horizontal **toolbar at the top**, in the mental order of the question, mirroring the
booking-search pattern (Skyscanner/Google Flights) people already know. Measurements are
**add/remove pills** rather than a checkbox list: they read as "what's included right now"
and keep the toolbar compact. Sensible defaults (a summer range, Daily aggregation) mean a
first-time user gets a meaningful result with **one click**, before understanding any option.

### 7.2 Designing around the data's seasonality (the biggest UX trap)

The Antarctic bases report almost only during the **austral summer (Dec–Feb)**. A naive
date picker lets the user land on an empty range and conclude "this is broken". Two
deliberate countermeasures:

- **Austral-summer presets** ("Summer 24/25", "Summer 25/26", …) generated dynamically, so
  the easy path is a range that *has* data.
- An **info "i" affordance** next to the dates that, on hover, explains when data exists.
- Future dates are **disabled** in the calendar, and an empty result renders an explanatory
  message pointing back to the Summer presets — never a blank screen.

This is data literacy built into the UI, which matters more here than any visual polish.

### 7.3 Reading three quantities honestly: linked panels, not one busy chart

Temperature (°C), pressure (hPa) and wind speed (m/s) share no scale. Forcing them onto a
single chart with multiple hidden Y-axes makes lines *look* correlated purely because of
axis scaling — a subtly dishonest visualization. Instead the default view is **three
stacked panels, one per measurement**, sharing a synchronized cursor (`syncId`): hovering
any panel shows the value at the **same instant on all three**, so you compare without the
axis-scaling lie. A single **range slider at the top** zooms every panel at once (one
control, one consistent window). Each panel can be **enlarged in a lightbox** for detail.

### 7.4 Correlation as a deliberate, secondary task

Overlaying the measurements *is* useful for spotting relationships (e.g. pressure drop vs
wind rise), but it is a secondary, intentional question — not the default. So correlation
lives behind a **"Correlate" action** that opens the combined multi-axis chart in a
lightbox. If the current query has a single measurement, the button becomes **"Correlate
with…"** and fetches the other series **on demand**, so the user never has to re-run the
whole query. Keeping this out of the default view avoids clutter while leaving it one click
away.

### 7.5 Showing mean / min / max without a rainbow

Because aggregation returns mean + min + max (§1), the natural instinct is to draw three
lines — but three jagged lines over a season smear into an unreadable blur, and they still
look busy even for a single day. So the spread is drawn the standard way: the **min–max
range is a single translucent band** and the **mean is one crisp line** on top. This reads
as one measurement with a spread, stays clean at any density (one day or three months), and
needs no gradient fill or per-series toggling. The band is a soft sky blue and the mean line
the teal accent — a cohesive cool pairing, with no warm colours that would falsely imply
"hot/cold" semantics. The tooltip still reports Max, Mean and Min for the hovered instant. A
`None` (raw) query has no min/max, so it is simply a single line.

### 7.6 Vertical space, honest states, correctness in the UI

- After a query, the filter toolbar **collapses** (with a small "Edit search" affordance) so
  all three panels are visible at once — the whole point of the stacked layout.
- **Honest states**: explicit loading, empty and error messages that say what to do, never a
  stack trace.
- **Correctness surfaced, not hidden**: units live in the headers (°C, hPa, m/s), the output
  time zone is shown, and timestamps are formatted **from the ISO string without
  re-converting to the browser's zone**, so the CET/CEST offset the backend computed is what
  the user sees regardless of where they are.

### 7.7 The table: sortable and virtualized for scale

The table is the "exact values" view, and a `None` query over a summer season is 10-minute
data — tens of thousands of rows. Two decisions keep it usable:

- **Sortable columns.** Clicking any header sorts by that field; clicking again flips the
  direction (e.g. *Temperature min* → highest first, then lowest). Numeric columns default
  to highest-first, text columns to A→Z, and nulls always sort last. This lets a user find
  extremes directly in the data, complementing the chart.
- **Virtual scrolling.** Only the rows inside the viewport (plus a small overscan) are
  rendered; two spacer rows preserve the real scroll height. Rendering tens of thousands of
  `<tr>` would freeze the browser, so this is a real scalability decision, not polish.

It is implemented **without a table library** (no TanStack/react-virtual dependency): a
fixed row height makes the index math a few lines, which keeps the bundle small and the
code self-contained. If requirements grew (resizable columns, grouping, column virtualization
for very wide tables), swapping in TanStack Table would be the next step — noted as a TODO.

### 7.8 Exports

Both views are exportable so the data leaves the app in whatever shape the next tool needs:

- **Table → CSV, JSON, Excel (.xlsx).** CSV and JSON are built in the browser with no
  dependency (CSV carries a UTF-8 BOM so Excel renders `ºC` correctly). Excel uses **SheetJS
  loaded from a CDN on demand** — the library is fetched only if the user actually clicks
  Excel, so it adds nothing to the bundle and needs no install step.
- **Charts → PNG, SVG.** Each panel (and the enlarged / correlation views) exports its live
  `<svg>`: SVG is serialized directly; PNG is rasterized via a canvas at 2× with a white
  background (the on-screen charts are transparent). No image library is pulled in.

### 7.9 DST visualization — a deliberate non-decision

Highlighting the CET↔CEST transition on the X axis was considered and **rejected on
purpose**: the DST change happens in late March / late October, while the data windows are
Dec–Feb, so a marker would essentially never fire. The DST *correctness* is guaranteed in
the backend and verified by tests; a decorative marker would add code and surface for zero
practical benefit. Left as a TODO in case a range ever crosses the boundary.

### 7.10 Point inspector — findings, framed honestly

Clicking any point opens an inspector that compares that instant to the whole queried
period. Because the panels are time-synced, one click selects the **instant** and the panel
shows all three measurements at once. Each is drawn on a **horizontal scale from the
period's min to its max**, with a marker for the clicked value and a tick for the period
average, a percentile chip ("windier than 78%"), and a one-line finding.

The important decision here is **framing, not code**. With three variables at one timestamp
you cannot legitimately conclude "this site is suitable to build X" — that is an engineering
claim the data can't support. So the inspector is deliberately **descriptive, not
prescriptive**: it reports where the point sits in the user's own data (percentile, extremes,
distance from the mean) and labels it with **standard, citable references only** — the
Beaufort scale for wind, the 0 °C freezing threshold, the 1013 hPa standard pressure. No
invented indices, no formulas whose units could be wrong, and a visible footnote stating it
is context, not a recommendation. The restraint is the point: it shows analytical judgement
without fabricating science that couldn't be defended.

## 8. Scalability & future work (TODO)

- Merge overlapping cached ranges and fill only true gaps (current version fetches the
  whole requested range if not fully covered).
- Add a background refresh for "today" (the only mutable window) and a TTL for it.
- Move from SQLite to PostgreSQL for concurrent high load (data layer already abstracted).
- Confirm the exact station civil time zone with the AEMET metadata.
- Rate-limit / queue outbound calls to AEMET as an extra safeguard.
- Mark the DST transition on the chart X axis **if** a queried range ever crosses it
  (see §7.7 — currently skipped because the seasonal data never does).
