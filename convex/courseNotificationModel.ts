import { v } from "convex/values";
import { defineTable } from "convex/server";

export const courseNoticeKind = v.union(
  v.literal("course_announcement"), v.literal("course_calendar"),
  v.literal("course_message"), v.literal("course_assignment"),
  v.literal("course_enrollment"), v.literal("course_result"),
  v.literal("course_grading"), v.literal("admin_grading"),
);
export type CourseNoticeKind = "course_announcement" | "course_calendar" |
  "course_message" | "course_assignment" | "course_enrollment" | "course_result" |
  "course_grading" | "admin_grading";
export const COURSE_NOTICE_KINDS: CourseNoticeKind[] = [
  "course_announcement", "course_calendar", "course_message",
  "course_assignment", "course_enrollment", "course_result",
  "course_grading", "admin_grading",
];
export const notificationPreferenceTables = {
  notificationPreferences: defineTable({
    ownerId: v.string(), disabled: v.array(courseNoticeKind), updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
};
export function cleanNoticeKey(value: string) {
  if (!/^[A-Za-z0-9_:-]{1,180}$/.test(value))
    throw new Error("VALIDATION_FAILED: Invalid event key.");
  return value;
}
export function cleanNoticeMessage(value: string) {
  const message = value.trim();
  if (!message || message.length > 220 || Array.from(message).some(c =>
    c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0))))
    throw new Error("VALIDATION_FAILED: Invalid notification message.");
  return message;
}
