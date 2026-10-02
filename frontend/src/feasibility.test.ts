import { describe, expect, it } from "vitest";
import { CUT_IN, CUT_OUT, RATED, capacityFactor, pearson, powerFraction } from "./feasibility";

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

describe("pearson (wind–solar complementarity)", () => {
  it("is +1 for perfectly correlated series", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
  });

  it("is -1 for perfectly anti-correlated series (complementary)", () => {
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 10);
  });

  it("returns null for a constant series or too few points", () => {
    expect(pearson([1, 2, 3], [5, 5, 5])).toBeNull();
    expect(pearson([1], [2])).toBeNull();
  });
});
