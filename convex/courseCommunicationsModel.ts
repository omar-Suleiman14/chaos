import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Course communications are not course-admission grants or notifications. */
export const courseCommunicationTables = {
  courseAnnouncements: defineTable({
    courseId: v.id("learnCollections"), ownerId: v.string(),
    title: v.string(), body: v.string(), published: v.boolean(), archived: v.boolean(),
    revision: v.number(), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_course", ["courseId"]),
  courseCalendarEvents: defineTable({
    courseId: v.id("learnCollections"), ownerId: v.string(),
    title: v.string(), details: v.string(), location: v.string(),
    startsAt: v.number(), endsAt: v.number(), published: v.boolean(), archived: v.boolean(),
    revision: v.number(), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_course", ["courseId"]),
  courseMessages: defineTable({
    courseId: v.id("learnCollections"), ownerId: v.string(), studentId: v.string(),
    senderId: v.string(), body: v.string(), createdAt: v.number(),
  }).index("by_course_student_created", ["courseId", "studentId", "createdAt"]),
  courseCommunicationAudit: defineTable({
    courseId: v.id("learnCollections"), ownerId: v.string(), actorId: v.string(),
    kind: v.string(), recordId: v.string(), action: v.string(),
    revision: v.number(), at: v.number(),
  }).index("by_course", ["courseId"]),
};

export function cleanClassText(value: string, max: number, label: string, required = true) {
  const clean = value.trim();
  if ((required && !clean) || clean.length > max || Array.from(clean).some(c => c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0))))
    throw new Error("VALIDATION_FAILED: Invalid " + label + ".");
  return clean;
}
export function validateClassEvent(data: {
  title: string; details: string; location: string; startsAt: number; endsAt: number;
}) {
  const title = cleanClassText(data.title, 180, "event title");
  const details = cleanClassText(data.details, 2000, "event details", false);
  const location = cleanClassText(data.location, 240, "event location", false);
  if (!Number.isSafeInteger(data.startsAt) || !Number.isSafeInteger(data.endsAt) ||
      data.startsAt < 0 || data.endsAt <= data.startsAt ||
      data.endsAt - data.startsAt > 7 * 86400000)
    throw new Error("INVALID_SCHEDULE: Event requires a valid start and end within seven days.");
  return { title, details, location, startsAt: data.startsAt, endsAt: data.endsAt };
}
