import { describe, expect, it } from "vitest";
import { formatGBP, formatGBPCompact, roundMoney } from "./money.js";

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
