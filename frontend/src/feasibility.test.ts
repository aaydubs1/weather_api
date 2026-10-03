import { describe, expect, it } from "vitest";
import { CUT_IN, CUT_OUT, RATED, capacityFactor, crf, lcoe, powerFraction } from "./feasibility";

describe("powerFraction (turbine power curve)", () => {
  it("is zero below cut-in and above cut-out", () => {
    expect(powerFraction(0)).toBe(0);
    expect(powerFraction(CUT_IN - 0.1)).toBe(0);
    expect(powerFraction(CUT_OUT + 0.1)).toBe(0);
  });

  it("is full (1) between rated and cut-out", () => {
    expect(powerFraction(RATED)).toBe(1);
    expect(powerFraction(18)).toBe(1);
    expect(powerFraction(CUT_OUT)).toBe(1);
  });

  it("rises cubically between cut-in and rated", () => {
    expect(powerFraction(CUT_IN)).toBe(0);           // at the threshold, still 0
    expect(powerFraction(7.5)).toBeCloseTo(0.2321, 4);
    // monotonically increasing in the ramp
    expect(powerFraction(6)).toBeLessThan(powerFraction(9));
  });

  it("handles NaN safely", () => {
    expect(powerFraction(NaN)).toBe(0);
  });
});

describe("capacityFactor", () => {
  it("averages the power fraction per reading (not from the mean speed)", () => {
    // 3 m/s -> 0, 12 m/s -> 1, 30 m/s -> 0 (above cut-out). Average = 1/3.
    expect(capacityFactor([3, 12, 30])).toBeCloseTo(0.3333, 4);
  });

  it("is 1 when every reading is at/above rated (within the band)", () => {
    expect(capacityFactor([12, 15, 20])).toBe(1);
  });

  it("is 0 for an empty series", () => {
    expect(capacityFactor([])).toBe(0);
  });

  it("density-corrects the sub-rated part but stays capped at rated", () => {
    // 7.5 m/s in the ramp: 0.23214 × 1.1 ≈ 0.25536.
    expect(capacityFactor([7.5], 1.1)).toBeCloseTo(0.2554, 3);
    // Already at rated: the correction cannot push output above 1.
    expect(capacityFactor([12], 1.1)).toBe(1);
  });
});

describe("crf (capital recovery factor)", () => {
  it("degrades to straight-line 1/years at rate 0", () => {
    expect(crf(0, 20)).toBeCloseTo(0.05, 10);
  });

  it("matches the textbook formula for a typical case", () => {
    // 5% over 20 years -> ~0.08024.
    expect(crf(0.05, 20)).toBeCloseTo(0.08024, 4);
  });

  it("is higher for a shorter horizon (more to recover per year)", () => {
    expect(crf(0.05, 10)).toBeGreaterThan(crf(0.05, 20));
  });

  it("is 0 for a non-positive horizon", () => {
    expect(crf(0.05, 0)).toBe(0);
  });
});

describe("lcoe (levelized cost of energy)", () => {
  it("recovers capex (via CRF) plus opex over annual energy", () => {
    // capex 60000 @ CRF(0.05,20)=0.080243 -> 4814.6/yr, +1200 opex = 6014.6, /30000 kWh.
    expect(lcoe(60000, 1200, 30000, 0.05, 20)).toBeCloseTo(0.2005, 3);
  });

  it("falls when more energy is produced", () => {
    const lo = lcoe(60000, 1200, 60000, 0.05, 20);
    const hi = lcoe(60000, 1200, 30000, 0.05, 20);
    expect(lo).toBeLessThan(hi);
  });

  it("is Infinity when no energy is produced", () => {
    expect(lcoe(60000, 1200, 0, 0.05, 20)).toBe(Infinity);
  });
});
