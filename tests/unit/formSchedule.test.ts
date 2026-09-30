import { describe, expect, it } from "vitest";
import { formatScheduleTime, isValidTimeZone, localToUtc, offsetLabel, scheduleState, utcToLocal } from "@/convex/formSchedule";

describe("schedule state (evaluated in UTC)", () => {
  const s = { opensAt: Date.UTC(2026, 5, 1, 12, 0), closesAt: Date.UTC(2026, 5, 2, 12, 0) };
  it("is not open before, open inside, closed at and after the closing instant", () => {
    expect(scheduleState(s, s.opensAt - 1)).toBe("not_open");
    expect(scheduleState(s, s.opensAt)).toBe("open");
    expect(scheduleState(s, s.closesAt - 1)).toBe("open");
    expect(scheduleState(s, s.closesAt)).toBe("closed");
  });
  it("a schedule with no zone (older forms) still works", () => {
    expect(scheduleState({ closesAt: 1000 }, 999)).toBe("open");
    expect(scheduleState({ closesAt: 1000 }, 1000)).toBe("closed");
    expect(scheduleState({}, 5)).toBe("open");
  });
});

describe("time zones", () => {
  it("validates IANA names", () => {
    expect(isValidTimeZone("Asia/Riyadh")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("converts wall time in a zone to the right UTC instant", () => {
    expect(localToUtc("2026-06-01T09:00", "Asia/Riyadh")).toBe(Date.UTC(2026, 5, 1, 6, 0));
    expect(localToUtc("2026-06-01T09:00", "UTC")).toBe(Date.UTC(2026, 5, 1, 9, 0));
    expect(localToUtc("2026-01-15T09:00", "America/New_York")).toBe(Date.UTC(2026, 0, 15, 14, 0));
    expect(localToUtc("2026-07-15T09:00", "America/New_York")).toBe(Date.UTC(2026, 6, 15, 13, 0));
    expect(localToUtc("nonsense", "UTC")).toBeUndefined();
    expect(localToUtc("2026-02-30T09:00", "UTC")).toBeUndefined();
    expect(localToUtc("2026-06-01T09:00", "Mars/Base")).toBeUndefined();
  });

  it("round-trips through the zone", () => {
    const instant = Date.UTC(2026, 5, 1, 6, 0);
    expect(utcToLocal(instant, "Asia/Riyadh")).toBe("2026-06-01T09:00");
    expect(localToUtc(utcToLocal(instant, "Asia/Kolkata"), "Asia/Kolkata")).toBe(instant);
  });

  it("handles the spring-forward gap (New York, 2026-03-08)", () => {
    // 02:30 does not exist; clocks jump from 02:00 EST to 03:00 EDT. It resolves to just after the jump.
    expect(localToUtc("2026-03-08T02:30", "America/New_York")).toBe(Date.UTC(2026, 2, 8, 7, 30));
    expect(localToUtc("2026-03-08T01:59", "America/New_York")).toBe(Date.UTC(2026, 2, 8, 6, 59));
    expect(localToUtc("2026-03-08T03:00", "America/New_York")).toBe(Date.UTC(2026, 2, 8, 7, 0));
  });

  it("handles the fall-back overlap (New York, 2026-11-01): first occurrence", () => {
    // 01:30 happens twice; the first is EDT (UTC-4).
    expect(localToUtc("2026-11-01T01:30", "America/New_York")).toBe(Date.UTC(2026, 10, 1, 5, 30));
    expect(localToUtc("2026-11-01T02:30", "America/New_York")).toBe(Date.UTC(2026, 10, 1, 7, 30));
  });

  it("a schedule across a daylight saving change closes at the right instant", () => {
    // Closes 09:00 New York on the Monday after spring forward.
    const closesAt = localToUtc("2026-03-09T09:00", "America/New_York")!;
    expect(closesAt).toBe(Date.UTC(2026, 2, 9, 13, 0));
    expect(scheduleState({ closesAt }, closesAt - 1)).toBe("open");
    expect(scheduleState({ closesAt }, closesAt)).toBe("closed");
  });

  it("formats times with the zone stated", () => {
    const text = formatScheduleTime(Date.UTC(2026, 5, 1, 6, 0), "Asia/Riyadh", "en");
    expect(text).toContain("Asia/Riyadh");
    expect(text).toContain("UTC+03:00");
    expect(text).toContain("09:00");
    expect(offsetLabel(Date.UTC(2026, 0, 15, 14, 0), "America/New_York")).toBe("UTC-05:00");
    expect(offsetLabel(Date.UTC(2026, 0, 15, 14, 0), "Asia/Kolkata")).toBe("UTC+05:30");
  });
});
