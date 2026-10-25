import { describe, expect, it } from "vitest";
import { formatGBP, formatGBPCompact, formatGBPShort, roundMoney } from "./money.js";

describe("money utilities", () => {
  it("normalizes negative zero and sub-penny drift", () => {
    expect(roundMoney(-0)).toBe(0);
    expect(roundMoney(-0.004)).toBe(0);
    expect(Object.is(roundMoney(-0.004), -0)).toBe(false);
    expect(formatGBP(-0)).toBe("£0.00");
    expect(formatGBP(-0.004)).toBe("£0.00");
    expect(formatGBPCompact(-0.004)).toBe("£0");
  });

  it("preserves real negative penny values", () => {
    expect(roundMoney(-0.005)).toBe(-0.01);
    expect(formatGBP(-0.005)).toBe("-£0.01");
  });
});

describe("formatGBPShort", () => {
  it("abbreviates thousands and millions with a true minus", () => {
    expect(formatGBPShort(850)).toBe("£850");
    expect(formatGBPShort(1500)).toBe("£1.5k");
    expect(formatGBPShort(12_400)).toBe("£12k");
    expect(formatGBPShort(1_250_000)).toBe("£1.3m");
    expect(formatGBPShort(-2000)).toBe("−£2k");
  });
});
