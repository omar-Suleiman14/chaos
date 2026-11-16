import { expect, it } from "vitest";
import { COURSE_NOTICE_KINDS, cleanNoticeKey, cleanNoticeMessage } from "../../convex/courseNotificationModel";
it("uses a closed set of academic event categories", () => {
  expect(COURSE_NOTICE_KINDS).toContain("course_message");
  expect(COURSE_NOTICE_KINDS).toContain("course_result");
  expect(new Set(COURSE_NOTICE_KINDS).size).toBe(COURSE_NOTICE_KINDS.length);
});
it("rejects unbounded or malformed events", () => {
  expect(cleanNoticeKey("message:abc_01")).toBe("message:abc_01");
  expect(() => cleanNoticeKey("https://x.test?q=x")).toThrow("VALIDATION_FAILED");
  expect(() => cleanNoticeKey("a".repeat(181))).toThrow("VALIDATION_FAILED");
  expect(cleanNoticeMessage(" New class ")).toBe("New class");
  expect(() => cleanNoticeMessage("\u0000")).toThrow("VALIDATION_FAILED");
  expect(() => cleanNoticeMessage("a".repeat(221))).toThrow("VALIDATION_FAILED");
});
