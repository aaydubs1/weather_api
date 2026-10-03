# Antártida — Wind Resource & Feasibility Explorer
<img width="1226" height="945" alt="image" src="https://github.com/user-attachments/assets/9e637218-f272-4bf9-b669-668b260999e4" />

A full-stack service that retrieves, caches and aggregates historical weather data from the
two **AEMET** Spanish Antarctic stations, built for the GS Inima Development Challenge.

**Who asks for this, and why.** Beyond "wrap the AEMET API", this is a **wind pre-feasibility
screen** for a **business-development / feasibility team**: before committing to a wind system
that would cut a remote base's diesel dependence, they need to turn historical weather into a
go/no-go-support read. A project goes ahead only when **both** sides of viability hold:

- **Technical viability** — is the wind resource strong, steady and inside a turbine's
  operating envelope (speed, temperature/icing, air density) enough of the time to generate?
- **Economic viability** — would it displace enough diesel (€, CO₂) to pay off?

The report is built around exactly those two gates. The four AEMET variables map directly onto
the turbine's operating thresholds, which is why they are the right data; the Antarctic bases
are the available data, but the method is a **reusable screen for any site**. Full reasoning in
**[DESIGN.md §1](./DESIGN.md)**; the tool stays **decision-support, not a verdict** (see
References for the cited thresholds).

- **Backend:** Python · FastAPI · pandas · SQLAlchemy (SQLite)
- **Frontend:** React · TypeScript · Vite · Recharts

> The reasoning behind every decision (why FastAPI, how time zones and DST are handled,
> why the aggregation keeps min/max, caching strategy, alternatives rejected, edge cases)
> is documented in **[DESIGN.md](./DESIGN.md)**. Please read it first — it shows *how the
> problem was studied* before writing code.

---

## What is implemented

| Part | Requirement | Status |
|------|-------------|--------|
| **1** | FastAPI service, the required endpoint, env-based API key, parameters (dates, location/offset, station, aggregation None/Hourly/Daily/Monthly, 0–3 measurements), output in Europe/Madrid with DST-aware offset, tests | ✅ Done |
| **2** | SQLite cache to avoid overloading the source, logging | ✅ Done |
| **3** | React + TypeScript frontend with a table and a chart | ✅ Done |

Anything not finished is marked as a `TODO` in the code and listed in DESIGN.md §8.

---

## Repository structure

```
weather_api/
├── DESIGN.md            # Problem analysis & decision log (read this first)
├── README.md
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app
│   │   ├── config.py          # env-based settings (API key, timezones, DB)
│   │   ├── stations.py        # the two allowed stations -> AEMET ids
│   │   ├── schemas.py         # enums & field mappings
│   │   ├── db.py              # SQLAlchemy models (cache)
│   │   ├── routers/antartida.py
│   │   └── services/
│   │       ├── aemet_client.py   # two-step AEMET request flow
│   │       ├── processing.py     # time zones, DST, aggregation (pandas)
│   │       └── cache.py          # read-through SQLite cache
│   ├── tests/                # pytest (processing, DST, AEMET client, endpoint, cache)
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/                  # React + TypeScript app
    ├── package.json
    └── .env.example
```

---

## Prerequisites

- Python 3.10+
- Node.js 18+
- A **free AEMET OpenData API key** from
  <https://opendata.aemet.es/centrodedescargas/inicio> — use a **personal email**
  (corporate accounts were observed to be blocked).

---

## Quick start (clone & run)

The project is a backend (FastAPI) and a frontend (React). Run each in **its own terminal**;
the backend must be running for the app to load data. Get your free AEMET key first (above).

```bash
# 0. Clone the repository
git clone https://github.com/aaydubs1/weather_api.git
cd weather_api
```

**Terminal 1 — backend** → serves on <http://localhost:8000>

```bash
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                  # Windows: copy .env.example .env
#  ↑ open .env and paste your key:  AEMET_API_KEY=your_key_here
uvicorn app.main:app --reload
```

**Terminal 2 — frontend** → opens on <http://localhost:5173>

```bash
cd frontend
npm install
cp .env.example .env                  # Windows: copy .env.example .env  (defaults are fine)
npm run dev
```

Now open <http://localhost:5173>, pick a station and a **Summer** date preset, and press
**Search**. If you only want to try the API, the interactive Swagger docs are at
<http://localhost:8000/docs>.

> **Troubleshooting:** if the app shows a connection error, make sure the backend terminal is
> running and that `frontend/.env` points `VITE_API_URL` at it (default `http://localhost:8000`).
> If the API returns an auth error, re-check `AEMET_API_KEY` in `backend/.env`.

---

## Backend — API & tests

Run it as shown in **Quick start** above (`uvicorn app.main:app --reload`).

- API root: <http://localhost:8000>
- Interactive docs (Swagger, auto-generated by FastAPI): <http://localhost:8000/docs>

### The endpoint

```
GET /api/antartida/datos/fechaini/{fechaIniStr}/fechafin/{fechaFinStr}/estacion/{identificacion}
```

Path parameters:

| Name | Example | Notes |
|------|---------|-------|
| `fechaIniStr` | `2023-07-01T00:00:00` | `YYYY-MM-DDTHH:MM:SS` |
| `fechaFinStr` | `2023-07-02T00:00:00` | `YYYY-MM-DDTHH:MM:SS` |
| `identificacion` | `juan_carlos_i` or `gabriel_de_castilla` (also the raw AEMET id) | only these two stations |

Query parameters:

| Name | Values | Default |
|------|--------|---------|
| `location` | IANA zone of the input datetimes, e.g. `Europe/Berlin` | — |
| `offset` | alternative to `location`, e.g. `+02:00` | — |
| `aggregation` | `None`, `Hourly`, `Daily`, `Monthly` | `None` |
| `measurements` | repeat 0–3 times: `temperature`, `pressure`, `speed` | empty = all |

Example:

```bash
curl "http://localhost:8000/api/antartida/datos/fechaini/2023-07-01T00:00:00/fechafin/2023-07-02T00:00:00/estacion/juan_carlos_i?aggregation=Hourly&measurements=temperature&measurements=speed"
```

Output is a JSON object `{ station, aggregation, timezone, count, data[] }`. Every
`Datetime` is in **Europe/Madrid** and carries its offset (`+02:00` in summer, `+01:00`
in winter). For aggregated queries each measurement includes `mean`, `min` and `max`
(the business case is about extremes, not just averages — see DESIGN.md).

When wind **speed** is included (or no filter is given), each row also carries the extras the
feasibility layer needs: `Wind direction (°)`, `Gust (m/s)`, `Humidity (%)` and
`Direction variability (°)`. In aggregated views direction is the **circular mean** (350° and
10° average to 0°, not 180°), gust becomes the bucket's `Peak gust (m/s)`, and the rest are
bucket means. Units are **m/s** for wind (AEMET observation products; verified — see DESIGN
§1). These map to the real AEMET Antarctic field names (`ddd`, `velx`, `hr`, `dddstd`).

### Tests

```bash
cd backend
pytest -q
```

The tests cover time-zone parsing, the DST boundary (summer `+02:00` vs winter `+01:00`),
hourly/daily aggregation (daily bucketed by the station's local day), the wind extras
(circular-mean direction, peak gust, humidity), the two-step AEMET flow (mocked, with a
transient-503 retry case), the endpoint, and the cache (hit **and** miss).

The frontend's business logic is unit-tested too (power curve, density-corrected capacity
factor):

```bash
cd frontend
npm test     # vitest
```

---

## Frontend — the app

Run it as shown in **Quick start** above (`npm install` then `npm run dev`).

Open <http://localhost:5173>. Pick a station, a date range, an aggregation and the
measurements, then press **Search**. The app opens on the **Feasibility** report (the
business conclusion); a **Data** tab holds the raw time-series **charts** and the **table**.

UX highlights (the reasoning is in **DESIGN.md §7**):

- **Skyscanner-style search header** with add/remove measurement pills and one-click
  **austral-summer presets**, plus an **info tooltip** — because the stations only report
  in the austral summer, the UI steers you to ranges that actually have data instead of
  letting you hit an empty result.
- **Feasibility report first:** the app opens on the business conclusion, organised top to
  bottom (operating thresholds → wind resource → power curve → economics), with the raw charts
  and table one click away under **Data**.
- In **Data → Charts**, **three linked panels** (one per measurement) with a **synchronized
  cursor** and a shared **range slider**, so you read all measurements at the same instant
  without cramming different units onto one misleading axis. Any panel enlarges in a lightbox.
- The **table** has **sortable columns** (click a header to rank by that field, e.g. highest
  temperature first) and **virtual scrolling**, so a raw 10-minute query of tens of thousands
  of rows stays smooth.
- **Exports:** the table downloads as **CSV / JSON / Excel**, and any chart as **PNG / SVG**.
- **Point inspector:** click any point to compare that instant to the whole period on a
  min–max scale (percentile, period average) with plain-language findings using standard
  references (Beaufort scale, freezing point) — deliberately descriptive, not a recommendation.
- **Feasibility report** contents: a **turbine operating-state** breakdown (generating vs
  stopped — too weak / storm / cold-icing) with a **wind-vs-temperature scatter** showing how
  each reading is classified against the thresholds; % of time in the productive wind band
  (3–25 m/s); a **power curve vs wind distribution** chart; a **wind rose** with direction
  steadiness; an **icing-risk** indicator (sub-zero *and* humid), temperature operability and
  **air density** (how pressure + temperature lift the capacity factor); data completeness; and
  an **economic estimate** with adjustable assumptions (turbine kW, diesel price, system cost,
  economic life, discount rate) → a density-corrected **capacity factor**, energy, diesel
  displaced, cost and CO₂ avoided, and a cumulative/daily **savings chart**. The decision metric
  is a **levelized cost of energy (LCOE)** for the wind project shown side-by-side with diesel's
  cost per kWh (the standard comparison in feasibility tools such as RETScreen), plus a **simple
  payback** and a **sensitivity "tornado"** showing how far the payback moves when each uncertain
  input is varied ±30% — i.e. how robust the decision is. Every figure carries an **"i"**
  explaining it; all against cited references (§1 and References), as decision-support rather
  than a verdict.
- Sensible defaults, explicit loading / empty / error states, units in headers, and the
  time zone made explicit — timestamps keep the backend's CET/CEST offset verbatim.

---

## Key design decisions (summary)

- **FastAPI** for async I/O, automatic Swagger docs and Pydantic validation.
- **UTC is the single internal source of truth**; the output is converted to
  Europe/Madrid with a DST-aware offset via the stdlib `zoneinfo`.
- **Daily/Monthly aggregation buckets by the station's local calendar day/month**, as the
  brief requires.
- **Aggregation keeps mean + min + max** because the wind-resource feasibility case is about
  extremes (e.g. cut-out-speed events), not just averages.
- **Read-through SQLite cache** with a record of already-fetched ranges, so AEMET is only
  called for data we have never retrieved (Part 2).

Full reasoning, alternatives considered and TODOs: **[DESIGN.md](./DESIGN.md)**.

---

## Development note

Built with AI assistance, as the brief encourages ("Vibe Coding"). The AI was used to move
fast, but **every decision was reviewed, justified and documented** — the reasoning lives in
**[DESIGN.md](./DESIGN.md)**, the domain figures are cited below rather than invented, and the
core logic (time zones/DST, aggregation, caching, the power-curve/capacity-factor model) is
covered by tests on both the backend (pytest) and the frontend (Vitest).

---

## References

The feasibility framing relies on standard, citable figures — not invented numbers. The
tool reports against these references and never claims an engineering verdict.

- **Turbine operating speeds** (cut-in ≈3 m/s, rated ≈12–15 m/s, cut-out ≈25 m/s):
  [What Are Cut-in, Rated, and Cut-out Wind Speeds?](https://eureka.patsnap.com/article/what-are-cut-in-rated-and-cut-out-wind-speeds)
- **Cold-climate operating limits** (standard ≈−10 °C operation / −20 °C survival; cold
  packages to ≈−30 °C; icing losses):
  [IEA Wind RP-13 — Wind energy projects in cold climates](https://iea-wind.org/wp-content/uploads/2022/12/RP-13-Cold-Climate.pdf) ·
  [IEA Wind Task 19 — Available Technologies](https://www.vaisala.com/sites/default/files/documents/Task%2019_Available_Technologies_report_WEinCC_May2016_approved.pdf)
- **Air density and power** (power ∝ ρ, ρ = P/RT, standard 1.225 kg/m³ at 15 °C; cold dense
  air yields more power):
  [The Missing Link Between Air Density and Wind Power Production](https://www.technologyreview.com/2011/03/15/196333/the-missing-link-between-air-density-and-wind-power-production/)
- **Precedent for techno-economic renewable analysis in Antarctica:**
  [Techno-economic analysis of renewable energy generation at the South Pole](https://arxiv.org/pdf/2306.13552)
- **Techno-economic methodology — LCOE, payback and sensitivity/risk analysis** (the model
  this tool's economic view mirrors): RETScreen, the international clean-energy feasibility
  standard — [NRCan RETScreen](https://natural-resources.canada.ca/energy-efficiency/retscreen) ·
  [Global Wind Atlas — Weibull-based resource assessment & capacity factor](https://journals.ametsoc.org/view/journals/bams/104/8/BAMS-D-21-0075.1.xml)
- **AEMET source fields** (the Antarctic dataset provides wind direction `ddd` and gust `velx`):
  [AEMET observation field help](https://www.aemet.es/en/eltiempo/observacion/ultimosdatos/ayuda)
