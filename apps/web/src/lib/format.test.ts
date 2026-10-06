import { describe, expect, it } from "vitest";
import { formatDuration, formatKg, formatReps, greeting } from "./format";
import { localIsoDate } from "./api";

describe("format helpers", () => {
  it("formats workout durations", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(-5)).toBe("0:00");
  });
  it("formats reps and weights", () => {
    expect(formatReps(8, 12)).toBe("8–12");
    expect(formatReps(10, 10)).toBe("10");
    expect(formatKg(null)).toBe("—");
    expect(formatKg(62.5)).toBe("62.5 kg");
    expect(formatKg(60)).toBe("60 kg");
  });
  it("greets by local time of day", () => {
    expect(greeting(new Date(2026, 0, 1, 8))).toBe("Good morning");
    expect(greeting(new Date(2026, 0, 1, 14))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 0, 1, 20))).toBe("Good evening");
  });
  it("uses the local calendar date, not UTC", () => {
    expect(localIsoDate(new Date(2026, 9, 6, 23, 30))).toBe("2026-10-06");
  });
});
