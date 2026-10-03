import { useEffect, useState } from "react";

export type GuideView = "feasibility" | "chart" | "table";

interface TourStep {
  title: string;
  body: React.ReactNode;
  tip?: React.ReactNode;
  target?: string; // id of the section to scroll to + highlight
}

const TOURS: Record<GuideView, TourStep[]> = {
  feasibility: [
    {
      title: "Run a query",
      target: "tour-query",
      body: <>Pick a <b>station</b>, a <b>date range</b>, an <b>aggregation</b> and the <b>measurements</b>, then press Search. Everything below updates from that one query.</>,
      tip: <>Leave measurements empty for all three. The stations report mostly in the austral summer, so start around <b>Dec–Feb</b>.</>,
    },
    {
      title: "The verdict at a glance",
      target: "tour-headline",
      body: <>This strip is the whole report in one line — the <b>two gates</b>: how much of the time a turbine would be <b>generating</b> (technical) and its cost per kWh <b>vs diesel</b> (economic).</>,
    },
    {
      title: "Technical viability",
      target: "tour-technical",
      body: <>The <b>donut</b> splits the period into generating vs stopped (too weak, storm, cold / icing). The <b>scatter</b> plots every reading by wind &amp; temperature — the dashed lines are the cut-in/cut-out speeds and the cold limit.</>,
      tip: <>A high "generating" share is the <b>technical gate</b> passing.</>,
    },
    {
      title: "The wind resource",
      target: "tour-resource",
      body: <>How often the wind sits in the productive band, the prevailing <b>direction</b> (rose), steadiness, icing risk and <b>air density</b> — the quality of the resource behind the headline numbers.</>,
    },
    {
      title: "Power curve",
      target: "tour-powercurve",
      body: <>Blue bars = how often each wind speed occurs; the green line = the turbine's power curve. The energy comes from where <b>tall bars meet the rising line</b>.</>,
    },
    {
      title: "Economic viability",
      target: "tour-economic",
      body: <>Adjust the assumptions (turbine kW, diesel price, cost, life, discount). Read the <b>LCOE bars</b> (wind vs diesel), the savings chart, the <b>payback</b>, and the <b>tornado</b> that shows which assumption the payback depends on most.</>,
      tip: <>Wind's LCOE <b>below</b> diesel's = the economic gate passing.</>,
    },
    {
      title: "Dig into the data",
      target: "tour-nav",
      body: <>Switch to <b>Data → Chart</b> or <b>Table</b> (left) for the raw readings behind the report, with zoom, a point inspector and CSV/JSON/Excel export.</>,
    },
  ],
  chart: [
    {
      title: "Linked panels",
      target: "tour-data",
      body: <>Each measurement is a stacked panel sharing one time axis — the band is min–max, the line is the mean.</>,
    },
    {
      title: "Zoom",
      target: "tour-data",
      body: <>Drag the handles on the slider under the charts to focus on a window; every panel zooms together.</>,
    },
    {
      title: "Inspect a point",
      target: "tour-data",
      body: <>Click any point to open a side panel comparing it to the whole period — min/max scale, Beaufort, wind direction &amp; gust.</>,
    },
    {
      title: "Export",
      target: "tour-data",
      body: <>Each panel saves to PNG or SVG from its own tools. The wind panel also overlays the turbine's <b>output potential</b> and the 3–25 m/s band.</>,
    },
  ],
  table: [
    {
      title: "Sort",
      target: "tour-data",
      body: <>Click any column header to sort by it; click again to flip the direction.</>,
    },
    {
      title: "Scroll at scale",
      target: "tour-data",
      body: <>The table is virtualized, so a full summer at 10-minute resolution scrolls smoothly.</>,
    },
    {
      title: "Export",
      target: "tour-data",
      body: <>Download the readings as <b>CSV</b>, <b>JSON</b> or <b>Excel</b> from the top-right. One column per measurement; <b>mean</b> columns appear when aggregated.</>,
    },
  ],
};

function highlight(target?: string) {
  if (!target) return;
  const el = document.getElementById(target);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("tour-highlight");
  window.setTimeout(() => el.classList.remove("tour-highlight"), 1800);
}

export function GuidePanel({ view, onClose }: { view: GuideView; onClose: () => void }) {
  const steps = TOURS[view];
  const [i, setI] = useState(0);

  // Restart the tour from the top whenever the user switches view.
  useEffect(() => { setI(0); }, [view]);
  // Scroll to + pulse the section this step is about.
  useEffect(() => { highlight(steps[i]?.target); }, [i, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = steps[i];
  const atStart = i === 0;
  const atEnd = i === steps.length - 1;
  const progress = ((i + 1) / steps.length) * 100;
  const viewLabel = view === "feasibility" ? "Feasibility" : view === "chart" ? "Chart" : "Table";

  return (
    <aside className="guide">
      <div className="guide-inner">
        <div className="guide-head">
          <span className="guide-title">Guided tour</span>
          <button className="guide-close" type="button" onClick={onClose} aria-label="Close tour">×</button>
        </div>

        <div className="guide-progress"><span style={{ width: `${progress}%` }} /></div>
        <div className="guide-stepmeta">{viewLabel} · step {i + 1} of {steps.length}</div>

        <div className="guide-card">
          <div className="guide-step-title"><span className="guide-num">{i + 1}</span>{step.title}</div>
          <p className="guide-step-body">{step.body}</p>
          {step.tip && <div className="guide-tip"><b>Tip</b> {step.tip}</div>}
        </div>

        <div className="guide-dots">
          {steps.map((_, d) => (
            <button
              key={d}
              className={d === i ? "guide-dot on" : "guide-dot"}
              onClick={() => setI(d)}
              aria-label={`Go to step ${d + 1}`}
            />
          ))}
        </div>

        <div className="guide-nav">
          <button className="guide-btn ghost" type="button" onClick={() => setI((v) => Math.max(0, v - 1))} disabled={atStart}>Back</button>
          {atEnd
            ? <button className="guide-btn primary" type="button" onClick={onClose}>Finish ✓</button>
            : <button className="guide-btn primary" type="button" onClick={() => setI((v) => Math.min(steps.length - 1, v + 1))}>Next →</button>}
        </div>

        <button className="guide-skip" type="button" onClick={onClose}>Skip tour</button>
      </div>
    </aside>
  );
}
