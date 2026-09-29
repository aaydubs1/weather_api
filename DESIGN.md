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

The reviewer stressed usability. Principles for the frontend:
- **One clear form**, top to bottom, in the order you think about the query: station →
  date range → aggregation → which measurements.
- **Sensible defaults** so a first-time user gets a result with one click.
- **Two views of the same data**: a **chart** (to see the pattern/extremes at a glance)
  and a **table** (for exact values), toggled or shown together.
- **Honest states**: loading, empty ("no data for this range"), and error messages that
  say what to do, not stack traces.
- Units shown in the headers (°C, hPa, m/s) and the time zone made explicit.

## 8. Scalability & future work (TODO)

- Merge overlapping cached ranges and fill only true gaps (current version fetches the
  whole requested range if not fully covered).
- Add a background refresh for "today" (the only mutable window) and a TTL for it.
- Move from SQLite to PostgreSQL for concurrent high load (data layer already abstracted).
- Confirm the exact station civil time zone with the AEMET metadata.
- Rate-limit / queue outbound calls to AEMET as an extra safeguard.
