import { afterEach, describe, expect, it } from "vitest";
import { journeyPending, markUsable, onJourney, startJourney } from "@/lib/journeys";

afterEach(() => performance.clearMarks());

describe("journey marks", () => {
  it("marks a page-load journey once, measured from navigation start", () => {
    const seen: string[] = [];
    const off = onJourney((journey) => seen.push(journey));
    expect(markUsable("dashboard")).toBeGreaterThanOrEqual(0);
    expect(markUsable("dashboard")).toBeNull();
    off();
    expect(seen).toEqual(["dashboard"]);
  });

  it("measures an in-app journey from its start mark and ends it", () => {
    startJourney("form.create");
    expect(journeyPending("form.create")).toBe(true);
    const ms = markUsable("form.create");
    expect(ms).not.toBeNull();
    expect(journeyPending("form.create")).toBe(false);
    const mark = performance.getEntriesByName("chaos:usable:form.create").at(-1) as PerformanceMark;
    expect((mark.detail as { ms: number }).ms).toBe(ms);
    // A second creation is a new journey.
    startJourney("form.create");
    expect(markUsable("form.create")).not.toBeNull();
  });
});
