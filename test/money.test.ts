import { describe, expect, it } from "vitest";
import { fromKop, parseRub, toKop } from "../src/utils/money.js";

describe("parseRub", () => {
  it("accepts number and numeric string", () => {
    expect(parseRub(2500)).toBe(2500);
    expect(parseRub("2500.00")).toBe(2500);
    expect(parseRub(" 99 ")).toBe(99);
  });

  it("rejects garbage and negative amounts", () => {
    expect(() => parseRub("abc")).toThrow();
    expect(() => parseRub(null)).toThrow();
    expect(() => parseRub(-1)).toThrow();
  });
});

describe("toKop / fromKop", () => {
  it("converts rubles to kopecks", () => {
    expect(toKop(2500)).toBe(250000);
    expect(toKop(99)).toBe(9900);
  });

  it("protects against floating-point precision loss (IEEE-754)", () => {
    expect(toKop(4723.9)).toBe(472390);
    expect(toKop(19.99)).toBe(1999);
    expect(toKop(0.29)).toBe(29);
    expect(toKop(1.14)).toBe(114);
  });

  it("truncates fractional kopecks", () => {
    expect(toKop(10.999)).toBe(1099);
    expect(toKop(19.999)).toBe(1999);
    expect(toKop(4723.909)).toBe(472390);
  });

  it("converts kopecks to rubles", () => {
    expect(fromKop(250000)).toBe(2500);
    expect(fromKop(1099)).toBe(10.99);
    expect(fromKop(472390)).toBe(4723.9);
    expect(fromKop(1999)).toBe(19.99);
    expect(fromKop(29)).toBe(0.29);
    expect(fromKop(114)).toBe(1.14);
  });
});
