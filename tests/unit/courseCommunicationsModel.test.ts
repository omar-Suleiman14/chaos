import { expect, it } from "vitest";
import { cleanClassText, validateClassEvent } from "../../convex/courseCommunicationsModel";

it("accepts Arabic and English while enforcing classroom content boundaries", () => {
  expect(cleanClassText("  أهلاً بالطلاب  ", 180, "title")).toBe("أهلاً بالطلاب");
  expect(() => cleanClassText("  ", 180, "title")).toThrow("VALIDATION_FAILED");
  expect(() => cleanClassText("a".repeat(181), 180, "title")).toThrow("VALIDATION_FAILED");
  expect(() => cleanClassText("ok\u0000bad", 180, "title")).toThrow("VALIDATION_FAILED");
});
it("validates finite, ordered class start and end timestamps", () => {
  const data = { title: " Lecture ١ ", details: "", location: " Classroom 4 ", startsAt: 1000, endsAt: 2000 };
  expect(validateClassEvent(data).title).toBe("Lecture ١");
  expect(validateClassEvent(data).location).toBe("Classroom 4");
  expect(() => validateClassEvent({ ...data, endsAt: 1000 })).toThrow("INVALID_SCHEDULE");
  expect(() => validateClassEvent({ ...data, startsAt: Number.NaN })).toThrow("INVALID_SCHEDULE");
  expect(() => validateClassEvent({ ...data, endsAt: 10 * 86400000 })).toThrow("INVALID_SCHEDULE");
});
