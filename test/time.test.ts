import { describe, expect, it } from "vitest";
import { dateAtOffset, datesBetween, isCalendarDate, orderDay, parseUtc, tzOffsetMinutes } from "../src/utils/time.js";

describe("parseUtc", () => {
  it("handles string with Z", () => {
    expect(parseUtc("2026-03-01T00:40:39.000Z").toISOString()).toBe("2026-03-01T00:40:39.000Z");
  });

  it("treats string without zone as UTC", () => {
    expect(parseUtc("2026-03-01T00:40:39").toISOString()).toBe("2026-03-01T00:40:39.000Z");
  });

  it("throws on invalid input", () => {
    expect(() => parseUtc("yesterday")).toThrow();
    expect(() => parseUtc(42)).toThrow();
  });
});

describe("tzOffsetMinutes", () => {
  it("computes time zone offset", () => {
    const at = new Date("2026-02-10T12:00:00Z");
    expect(tzOffsetMinutes("UTC", at)).toBe(0);
    expect(tzOffsetMinutes("Europe/Moscow", at)).toBe(180);
    expect(tzOffsetMinutes("Asia/Novosibirsk", at)).toBe(420);
    expect(tzOffsetMinutes("America/New_York", at)).toBe(-300);
  });
});

describe("dates", () => {
  it("dateAtOffset", () => {
    expect(dateAtOffset(new Date("2026-02-10T21:30:00Z"), 180)).toBe("2026-02-11");
    expect(dateAtOffset(new Date("2026-02-10T20:30:00Z"), 180)).toBe("2026-02-10");
  });

  it("isCalendarDate", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("26-02-01")).toBe(false);
  });

  it("datesBetween includes boundaries", () => {
    expect(datesBetween("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });
});

describe("orderDay", () => {
  it("resolves order date in time zone accounting for daylight saving time (DST)", () => {
    // Europe/Berlin switches to DST (CET UTC+1 -> CEST UTC+2) on March 29, 2026 at 02:00 CET (01:00 UTC)
    // March 28 22:30 UTC = 23:30 CET -> 2026-03-28
    expect(orderDay(new Date("2026-03-28T22:30:00Z"), "Europe/Berlin")).toBe("2026-03-28");
    // March 29 00:30 UTC = 01:30 CET -> 2026-03-29
    expect(orderDay(new Date("2026-03-29T00:30:00Z"), "Europe/Berlin")).toBe("2026-03-29");
    // March 29 22:30 UTC = 00:30 CEST (next day) -> 2026-03-30
    expect(orderDay(new Date("2026-03-29T22:30:00Z"), "Europe/Berlin")).toBe("2026-03-30");
    // March 30 22:30 UTC = 00:30 CEST (next day) -> 2026-03-31
    expect(orderDay(new Date("2026-03-30T22:30:00Z"), "Europe/Berlin")).toBe("2026-03-31");
  });

  it("works correctly across different time zones", () => {
    const d = new Date("2026-02-10T21:30:00Z");
    expect(orderDay(d, "UTC")).toBe("2026-02-10");
    expect(orderDay(d, "Europe/Moscow")).toBe("2026-02-11"); // UTC+3 -> 00:30
    expect(orderDay(d, "America/New_York")).toBe("2026-02-10"); // UTC-5 -> 16:30
  });
});
