import { describe, expect, it } from "vitest";
import {
  addMonths,
  friendlyDayLabel,
  isValidIsoDate,
  monthsBetween,
  parseIsoDateLocal,
  todayIso,
} from "./month.js";

describe("month utilities", () => {
  it("addMonths walks forwards and backwards across year boundaries", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-06", 0)).toBe("2026-06");
    expect(addMonths("2026-06", -11)).toBe("2025-07");
  });

  it("monthsBetween is inclusive and ordered", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(monthsBetween("2026-03", "2026-01")).toEqual([]);
  });

  it("parseIsoDateLocal builds a LOCAL date, not UTC", () => {
    const d = parseIsoDateLocal("2026-07-02")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(2); // would be the 1st in UTC-parsing under negative offsets
  });

  it("friendlyDayLabel: today/yesterday/weekday relative to an injected now", () => {
    const now = new Date(2026, 6, 2, 15, 30); // Thu 2 Jul 2026, local
    expect(friendlyDayLabel("2026-07-02", now)).toBe("Today");
    expect(friendlyDayLabel("2026-07-01", now)).toBe("Yesterday");
    expect(friendlyDayLabel("2026-06-29", now)).toBe("Monday");
    expect(friendlyDayLabel("2026-06-10", now)).toContain("June");
    expect(friendlyDayLabel("garbage", now)).toBe("garbage");
  });

  it("isValidIsoDate rejects malformed and rollover dates", () => {
    expect(isValidIsoDate("2026-07-02")).toBe(true);
    expect(isValidIsoDate("2026-02-31")).toBe(false); // would roll to March
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
    expect(isValidIsoDate("02/07/2026")).toBe(false);
  });

  it("todayIso formats the injected date", () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
