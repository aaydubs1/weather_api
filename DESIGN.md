# Design & Decision Log

> This document explains **how the problem was analysed** and **why** each decision
> was taken, before and while writing the code. It is deliberately written first:
> the goal is to show the reasoning, the trade-offs and the edge cases that were
> considered — not just the final implementation.

## 1. The problem behind the problem

Taken literally, the brief is "wrap the AEMET Antarctic API". But a tool is only worth
building if it answers a real decision, so the first question is *who would ask for a
history of wind, temperature and pressure at the two Spanish Antarctic bases, and why?*

### The stakeholder and the decision

The credible internal customer is a **business-development / feasibility team** — the kind of
profile an environmental and utilities company that develops and operates infrastructure under
concession (GS Inima's world) would put on this. Before committing investment, they
**pre-screen a site**: could an **on-site wind system cut a remote base's diesel dependence**?
Antarctic research stations run on diesel generators whose fuel is shipped or flown in at very
high cost and environmental impact, and the bases operate only during the austral-summer
campaign. A project **goes ahead only when both sides of viability are adequate** — which is
the interviewer's own framing ("los sistemas funcionan si la viabilidad tanto técnica como
económica es la adecuada"), and the spine of this tool's report:

- **Technical viability:** is the wind resource strong, steady and inside a turbine's operating
  envelope **enough of the time** to generate reliably?
- **Economic viability:** would the energy produced **displace enough diesel** (€, CO₂) to
  justify the investment?

The Antarctic bases are only the available data; the same screen is a **reusable method for
any site**.

### Why these variables are exactly the right ones

This is not a narrative stretched onto the data — the measurements map directly onto a
turbine's **operating thresholds** (figures cited in the README references, not invented):

- **Wind speed** is the resource. A turbine only produces inside a band: it starts
  (*cut-in*) at ≈3 m/s, reaches rated power at ≈12–15 m/s, and shuts down for safety
  (*cut-out*) at ≈25 m/s, and power scales with the **cube** of speed. So what matters is
  how much of the time the wind sits in that productive band — not its bare average.
- **Temperature** decides whether the turbine can run *and at what cost*: standard machines
  operate to ≈−10 °C and survive to ≈−20 °C; cold-climate packages reach ≈−30 °C but burn
  parasitic power heating components, and sub-zero + moisture brings blade **icing**, which
  cuts output or forces shutdown.
- **Pressure with temperature** give **air density** (ρ = P/RT), and power is proportional
  to density. Cold, dense Antarctic air yields *more* power for the same wind speed than a
  temperate site — a genuine point in the project's favour, and one that uses both variables.
- **Wind direction and gusts** (AEMET fields `ddd`, `velx`) are part of resource quality: a steady
  prevailing direction means better siting and less turbulence/fatigue. They exist in the
  AEMET source even though the brief only named temperature, pressure and speed, so they can
  be added without changing the data source.

The interviewer's key hint was that a turbine's **operating thresholds** are "where all the
factors come in — speed, direction, pressure and temperature." They do not act separately:
they all shape the **power curve and the operating envelope**. This is the mapping the tool is
built around:

| Variable | How it enters the turbine's operating thresholds |
|---|---|
| **Wind speed** | The axis of the power curve: cut-in ≈3, rated ≈12–15, cut-out ≈25 m/s. Drives the capacity factor. |
| **Pressure + temperature** | Together give **air density** (ρ = P/RT); power ∝ density, so cold dense air **shifts the power curve up** — it raises the capacity factor for the same wind. Surfaced explicitly (CF "+X% from air density"). |
| **Temperature** | Also sets the **cold operating limit** (standard ≈−10 °C, cold-climate package to ≈−30 °C) and, with humidity, the **icing** risk that cuts output. |
| **Wind direction** | Siting and turbulence/fatigue — a steady prevailing direction (low `dddstd`) is a better, more constant resource. |

So pressure and temperature are not decorative: they move the turbine's effective output
through density, which is exactly where the operating thresholds "come in."

### The honesty guardrail (and a correctness prerequisite)

Three variables at a point can *describe* conditions; they cannot *pronounce* a site
buildable. So the tool is deliberately **decision-support, not a verdict**: it reports the
resource against **cited, standard references** (the turbine operating band, cold-climate
limits, standard air density of 1.225 kg/m³) and models the economics as a **transparent
calculation driven by the analyst's own assumptions** (turbine rating, delivered diesel
price, O&M, cold-climate premium) — never a single fabricated "it pays off".

This rests on a unit that every turbine threshold depends on, so it was **verified, not
assumed**: AEMET's *observation* products report wind in **m/s** (checked against the
observation-network field metadata, where `vv`/`vmax` are documented in m/s), while only the
*forecast* products use km/h. The Antarctic dataset is an observation product and the brief
maps `vel → Speed (m/s)`, so `vel` is in m/s. A final confirmation against the live
`metadatos` of an `antartida` response is noted in §8.

### What this means for scope

The parts the brief requires — the endpoint, DST-correct output, aggregation that keeps
`min`/`max` (the extremes a resource study needs, e.g. cut-out-speed events), the cache, and
the table/chart UI — are **built and tested**. The reframing above is what the remaining
work serves: a **resource & techno-economic feasibility layer** (wind-band and
direction summary, air-density-adjusted resource, temperature/icing operability, and an
assumption-driven economic estimate). Whatever is not yet built is marked `TODO` and listed
in §8, so this document separates clearly what runs today from the direction it is taking.

**Scope kept to wind.** The brief names only turbines, so the deliverable stays on wind
generation: the report is built around the turbine's operating thresholds and the economics of
a wind system displacing diesel. Other generation sources are deliberately left out to keep the
analysis focused and defensible against the brief.

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
- **Transient AEMET failures** (HTTP 429/503/5xx, which AEMET returns under load) → retried a
  few times with backoff, then surfaced as a clean 502 with a "try again shortly" message
  rather than crashing the request.
- **Secret safety** → the AEMET `api_key` travels only in the request params, never in log
  messages, and the `httpx` request logger is raised to WARNING so the key is never logged.
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

### 7.0 Information architecture: a report, with the data behind it

The app is organised around the business decision, not the raw endpoint. After a search it
opens on **Feasibility** — a one-page report that reads top to bottom as the analysis would:
the turbine's **operating-state breakdown** (with a wind-vs-temperature scatter) → the wind
**resource summary** (productive band, wind rose) → the **power curve vs wind distribution** →
the **economic estimate**. A second area, **Data**, holds the raw material behind that
report: the time-series **charts** (with the point inspector) and the **table** (with
exports). This separation — conclusion first, evidence a click away — is what makes the
deliverable read as a decision-support tool rather than a data viewer, and it is why the
default landing is the report, not the chart.

The shell is a standard analytics-dashboard layout: a fixed **left sidebar** (brand +
Report/Data navigation + a "current selection" context card showing station, range,
aggregation and time zone) and a **content area** with a per-view **title bar** (page title,
one-line purpose, date-range chip and the export/edit actions). The navigation and the current
query live in the chrome, so each content card carries only its own analysis — which is what
lets the report read cleanly for a professional audience. It collapses to a horizontal top bar
below 860 px. The palette is unchanged (accent `#0e7490` teal on a `#f4f7fb` canvas); only the
structure moved.

A **right-hand guided tour** (`GuidePanel`) fills the remaining width on wide screens: an
interactive, step-by-step onboarding whose steps are tailored to the active view. Advancing a
step **scrolls the matching section into view and pulses it**, so the user learns the report by
being walked through the real thing rather than reading a wall of text — keeping the report
itself uncluttered (detailed definitions stay in the per-figure "i" tooltips). It has a progress
bar, clickable step dots, Back/Next/Finish and Skip, remembers nothing it shouldn't, resets when
the view changes, and is dismissable (re-openable from the top bar). It collapses away below
1180 px, where the inline tooltips carry the help.

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

### 7.4 One-glance synthesis: the operating-threshold breakdown

The report opens with the decision made concrete: a **donut** of the turbine's operating state
over the period — *generating* (wind in the 3–25 m/s band and temperature within limits) vs
*stopped* (too weak, storm, or cold/icing) — with the "generating" share in the centre. That
share is the **technical side of viability**; the caption ties it to the **economic** side
below ("a system is viable only when both are adequate"). To show **where those numbers come
from**, a **scatter** places every reading by its wind speed (x) and temperature (y) against
the threshold lines, so you can see which readings fall inside the operating window. This
replaces an invented composite score with a transparent, derived breakdown.

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
- **Charts → PNG, SVG.** Each panel (and the enlarged view) exports its live
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

**Techno-economic feasibility layer (the direction set out in §1 — in progress):**

- **Units:** `vel` is in **m/s** — AEMET observation products report wind in m/s (verified
  against the observation-network metadata; forecasts use km/h). Done; a final check against a
  live `antartida` `metadatos` response is still worth doing before publishing feasibility
  numbers.
- **Wind direction (`ddd`) and gust (`velx`) — done:** both are pulled from the source,
  cached, and returned. Shown with wind speed; aggregation uses the **circular mean** for
  direction (degrees don't average arithmetically) and the **bucket maximum** for gust.
- **Operating-state breakdown & resource summary — done** (the **Feasibility** view): the
  turbine's operating state over the period (generating vs stopped — too weak / storm / cold-
  icing) with a **wind-vs-temperature scatter** showing the derivation; % of time in the
  productive wind band (3–25 m/s); a **wind rose** with direction steadiness (`dddstd`); mean
  wind and steadiness (coefficient of variation); an **icing-risk** indicator refined with
  humidity (`hr`): cold *and* moist, not just sub-zero; temperature operability (below the
  −10 °C limit); **air density** (ρ = P/RT, vs 1.225); and **data completeness**. All
  descriptive, against cited references. Refinement TODO: speed-weight the wind rose and compute
  band/operability on reading-level (None) data for precision.
- **Economic estimate — done** (in the Feasibility view): each reading is mapped through a
  shared **power curve** (`feasibility.ts`, cubic cut-in→rated, flat to cut-out) to a
  **capacity factor** (computed per reading then averaged — never from the mean speed, since
  power is convex). An **assumption-driven** model with user inputs (turbine kW, diesel L/kWh,
  €/L, system cost) yields energy, diesel displaced, cost and CO₂ avoided, a cumulative/daily
  **savings chart**, and an indicative payback. The capacity factor is **density-corrected**
  (ρ = P/RT: cold, dense Antarctic air yields a little more power, capped at rated) — surfaced
  explicitly ("+X% from air density"), which is how **pressure and temperature** enter the
  turbine thresholds. Transparent inputs, no single fabricated verdict. The wind chart also
  carries a green **"output potential" overlay** (the same power curve over time) with the band
  3–25 m/s and cut-in/cut-out markers. The power-curve and capacity-factor functions live in
  `feasibility.ts` and are **unit-tested** (Vitest).
- **Decision metrics — LCOE + sensitivity (done):** on top of the raw savings, the economic
  view reports the two numbers a feasibility analyst actually decides on — mirroring
  **RETScreen**, the international standard for exactly this "technical + economic viability"
  question. (1) A **levelized cost of energy (LCOE)** for the wind project — capex annualised by
  the **capital recovery factor** (discount rate + economic life) plus O&M, over the annual
  energy — shown **side-by-side with diesel's fuel cost per kWh**, so the decision reads directly
  ("wind is €X/kWh cheaper"). Diesel's bar is fuel-only, deliberately conservative (it omits
  genset capex/upkeep), so the real gap only widens. (2) A **sensitivity "tornado"**: the simple
  payback recomputed with each uncertain input (diesel price, wind resource, system cost, diesel
  L/kWh) swung ±30% in turn — the longest bars are the assumptions the decision hinges on. This
  turns a static report into a **risk-aware decision tool**. `crf()` and `lcoe()` live in
  `feasibility.ts` and are **unit-tested**.

**Platform / robustness:**

- Merge overlapping cached ranges and fill only true gaps (current version fetches the
  whole requested range if not fully covered).
- Add a background refresh for "today" (the only mutable window) and a TTL for it.
- Move from SQLite to PostgreSQL for concurrent high load (data layer already abstracted).
- Confirm the exact station civil time zone with the AEMET metadata.
- Rate-limit / queue outbound calls to AEMET as an extra safeguard.
- Mark the DST transition on the chart X axis **if** a queried range ever crosses it
  (see §7.7 — currently skipped because the seasonal data never does).
