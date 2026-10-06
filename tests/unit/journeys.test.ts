import { afterEach, describe, expect, it } from "vitest";
import { journeyPending, markStep, markUsable, onJourney, onJourneyStep, startJourney, type JourneyOrigin } from "@/lib/journeys";

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

  it("reports whether a journey started from an action or the page load", () => {
    const origins: JourneyOrigin[] = [];
    const off = onJourney((_journey, _ms, origin) => origins.push(origin));
    markUsable("lesson.edit");
    startJourney("quiz.next");
    markUsable("quiz.next");
    off();
    expect(origins).toEqual(["load", "action"]);
  });

  it("records funnel steps once per started journey", () => {
    const steps: string[] = [];
    const off = onJourneyStep((journey, step) => steps.push(`${journey}:${step}`));
    expect(markStep("form.create", "first_edit")).toBeNull();
    startJourney("form.create");
    markUsable("form.create");
    expect(markStep("form.create", "first_edit")).toBeGreaterThanOrEqual(0);
    expect(markStep("form.create", "first_edit")).toBeNull();
    expect(markStep("form.create", "published")).not.toBeNull();
    // A new creation starts a new funnel.
    startJourney("form.create");
    expect(markStep("form.create", "first_edit")).not.toBeNull();
    off();
    expect(steps).toEqual(["form.create:first_edit", "form.create:published", "form.create:first_edit"]);
  });
});
