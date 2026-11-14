import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { defaultExamSettings } from "../../convex/examSettingsModel";
import { makeIntegrityPolicy } from "../../convex/examIntegrityModel";
import { createExamAttemptTiming } from "../../convex/examSubmissionModel";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());

async function fixture() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  const student = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await owner.mutation(api.courses.create, { title: "Exam autosave" });
  const questionId = await owner.mutation(api.questionBank.createForCourse, {
    courseId, item: {
      kind: "single_choice", prompt: "Which valve?", choices: [
        { id: "a", text: "Mitral" }, { id: "b", text: "Pulmonary" },
      ], correctChoiceIds: ["a"], points: 1,
      topics: [], terms: [], outcomes: [], status: "ready",
    },
  });
  const draftId = await owner.mutation(api.examBuilder.createDraft, { courseId });
  await owner.mutation(api.examBuilder.savePlan, {
    draftId, expectedRevision: 0, title: "Valve exam", targetCount: 1,
    allocations: [{ id: "all", kind: "course", key: "", count: 1, points: 1 }],
  });
  await owner.mutation(api.examBuilder.setSelections, {
    draftId, expectedRevision: 1,
    selections: [{ questionId, allocationId: "all" }],
  });
  const { snapshotId } = await owner.mutation(api.examRuntime.sealDraft, {
    draftId, expectedRevision: 2,
  });
  await owner.mutation(api.examSettings.saveForDraft, {
    draftId, expectedRevision: 0, settings: defaultExamSettings,
  });
  await owner.mutation(api.examSettings.setPrepared, {
    draftId, expectedRevision: 1, prepared: true,
  });
  await t.run(async ctx => {
    const course = await ctx.db.get("learnCollections", courseId);
    if (!course) throw new Error("missing course");
    const pub = await ctx.db.insert("collectionVersions", {
      collectionId: courseId, number: 1, metadata: course.metadata,
      items: [], publishedAt: Date.now(),
    });
    await ctx.db.patch("learnCollections", courseId, {
      publishedVersionId: pub, visibility: "public",
    });
    const now = Date.now();
    await ctx.db.insert("courseJoinRequests", {
      courseId, ownerId: creatorIdentity.subject, studentId: otherCreatorIdentity.subject,
      status: "approved", requestedAt: now, updatedAt: now, reviewedAt: now,
      reviewedBy: creatorIdentity.subject,
    });
    await ctx.db.insert("courseEnrollments", {
      courseId, ownerId: creatorIdentity.subject,
      key: "user:" + otherCreatorIdentity.subject,
      studentId: otherCreatorIdentity.subject, completedLessonIds: [],
      enrolledAt: now, updatedAt: now,
    });
  });
  await owner.mutation(api.examAudience.setForDraft, {
    draftId, expectedRevision: 0,
    audience: { mode: "all", studentIds: [], groupIds: [] }, assigned: true,
  });
  const releaseId = await t.run(async ctx => {
    const release = await ctx.db.query("examReleases")
      .withIndex("by_draft", q => q.eq("draftId", draftId)).unique();
    if (!release) throw new Error("missing release");
    return release._id;
  });
  const pre = await student.query(api.examPreflight.get, { releaseId });
  await student.mutation(api.examPreflight.acknowledge, {
    releaseId, expectedPolicyVersion: pre.policyVersion,
    expectedConsentRevision: pre.consentRevision, accepted: true,
  });
  const attemptId = await t.run(async ctx => {
    const startedAt = Date.now();
    return ctx.db.insert("examAttempts", {
      ownerId: creatorIdentity.subject, courseId, snapshotId,
      studentId: otherCreatorIdentity.subject, state: "in_progress", revision: 0,
      startedAt, updatedAt: startedAt,
      ...createExamAttemptTiming(defaultExamSettings, startedAt),
    });
  });
  return { t, owner, student, courseId, releaseId, attemptId };
}


async function enabledFixture(mode: "off" | "record" | "warn" | "review" = "review") {
  const f = await fixture();
  await f.t.run(async ctx => {
    await ctx.db.patch("examReleases", f.releaseId, { studentEntryEnabled: true });
    await ctx.db.patch("examAttempts", f.attemptId, {
      integrityPolicy: makeIntegrityPolicy(mode, 15_000, 2),
    });
  });
  return f;
}

it("fails closed on disabled releases, opt-out policy and unrelated identities", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch("examAttempts", f.attemptId, {
    integrityPolicy: makeIntegrityPolicy("warn"),
  }));
  await expect(f.student.mutation(api.examIntegrity.record, {
    attemptId: f.attemptId, eventId: "event-release-gated", kind: "blur",
  })).rejects.toThrow("EXAM_NOT_READY");
  await f.t.run(ctx => ctx.db.patch("examReleases", f.releaseId, {
    studentEntryEnabled: true,
  }));
  await expect(f.owner.mutation(api.examIntegrity.record, {
    attemptId: f.attemptId, eventId: "event-other-person", kind: "blur",
  })).rejects.toThrow("NOT_FOUND");
  await expect(f.owner.query(api.examIntegrity.getMine, {
    attemptId: f.attemptId,
  })).rejects.toThrow("NOT_FOUND");
  await expect(f.t.mutation(api.examIntegrity.record, {
    attemptId: f.attemptId, eventId: "event-anonymous", kind: "blur",
  })).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("examAttempts", f.attemptId, {
    integrityPolicy: makeIntegrityPolicy(),
  }));
  await expect(f.student.mutation(api.examIntegrity.record, {
    attemptId: f.attemptId, eventId: "event-opted-out", kind: "blur",
  })).rejects.toThrow("INTEGRITY_DISABLED");
  expect(await f.student.query(api.examIntegrity.getMine, {
    attemptId: f.attemptId,
  })).toEqual([]);
});

it("coalesces hidden and blur, applies server grace and never auto-finalizes", async () => {
  const { t, student, owner, attemptId } = await enabledFixture();
  const record = (eventId: string, kind:
    "hidden" | "visible" | "blur" | "focus" | "offline" | "online" |
    "fullscreen_exit" | "fullscreen_enter" | "pagehide") =>
    student.mutation(api.examIntegrity.record, { attemptId, eventId, kind });
  const hidden = await record("event-hide-first", "hidden");
  expect(hidden).toMatchObject({ decision: "observed", gapMs: null });
  await record("event-blur-first", "blur");
  vi.setSystemTime(Date.now() + 7_000);
  const returned = await record("event-back-first", "focus");
  expect(returned).toMatchObject({ decision: "grace", gapMs: 7_000 });
  await record("event-hide-second", "hidden");
  vi.setSystemTime(Date.now() + 16_000);
  const first = await record("event-back-second", "visible");
  expect(first).toMatchObject({ decision: "warning", gapMs: 16_000 });
  expect(await record("event-back-second", "visible")).toEqual(first);
  await expect(record("event-back-second", "blur")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  await record("event-hide-third", "blur");
  vi.setSystemTime(Date.now() + 16_000);
  const second = await record("event-back-third", "focus");
  expect(second).toMatchObject({ decision: "review_required", gapMs: 16_000 });
  const timeline = await student.query(api.examIntegrity.getMine, { attemptId });
  expect(timeline).toHaveLength(7);
  expect(timeline.some(e => e.decision === "review_required")).toBe(true);
  expect(JSON.stringify(timeline)).not.toMatch(/prompt|correctChoiceIds|answer|studentId|clipboard|URL/);
  await expect(owner.query(api.examIntegrity.getMine, { attemptId })).rejects.toThrow("NOT_FOUND");
  expect((await t.run(ctx => ctx.db.get("examAttempts", attemptId)))?.state)
    .toBe("in_progress");
});

it("treats network recovery as connectivity and rejects post-deadline events", async () => {
  const { student, attemptId } = await enabledFixture("warn");
  const offline = await student.mutation(api.examIntegrity.record, {
    attemptId, eventId: "event-network-out", kind: "offline",
  });
  expect(offline.decision).toBe("observed");
  vi.setSystemTime(Date.now() + 40_000);
  const online = await student.mutation(api.examIntegrity.record, {
    attemptId, eventId: "event-network-in", kind: "online",
  });
  expect(online).toMatchObject({ gapMs: 40_000, decision: "connection" });
  vi.setSystemTime(Date.now() + defaultExamSettings.durationMinutes * 60_000 + 1);
  await expect(student.mutation(api.examIntegrity.record, {
    attemptId, eventId: "event-too-late", kind: "hidden",
  })).rejects.toThrow("ATTEMPT_TIMED_OUT");
});

it("rate limits event spam and expires private event rows without keeping identifiers", async () => {
  const { t, student, attemptId } = await enabledFixture("record");
  for (let i = 0; i < 20; i++) {
    await student.mutation(api.examIntegrity.record, {
      attemptId, eventId: "event-spam-" + i.toString().padStart(3, "0"), kind: "pagehide",
    });
  }
  await expect(student.mutation(api.examIntegrity.record, {
    attemptId, eventId: "event-spam-last", kind: "pagehide",
  })).rejects.toThrow("RATE_LIMITED");
  const row = await t.run(ctx => ctx.db.query("examIntegrityEvents")
    .withIndex("by_attempt_time", q => q.eq("attemptId", attemptId)).first());
  expect(row).not.toBeNull();
  vi.setSystemTime(row!.expiresAt + 1);
  expect(await student.query(api.examIntegrity.getMine, { attemptId })).toEqual([]);
  expect(await t.mutation(internal.examIntegrity.purgeExpired, {
    rowId: row!._id, expiresAt: row!.expiresAt,
  })).toBe(true);
  expect(await t.run(ctx => ctx.db.get("examIntegrityEvents", row!._id))).toBeNull();
});


it("allows student explanations and teacher-only, non-punitive adjudication", async () => {
  const { t, owner, student, attemptId } = await enabledFixture("review");
  await student.mutation(api.examIntegrity.record, {
    attemptId, eventId: "event-human-review", kind: "hidden",
  });
  await expect(student.query(api.examInvigilation.report, { attemptId }))
    .rejects.toThrow("NOT_FOUND");
  await expect(t.query(api.examInvigilation.report, { attemptId }))
    .rejects.toThrow();
  const before = await owner.query(api.examInvigilation.report, { attemptId });
  expect(before.events).toHaveLength(1);
  expect(JSON.stringify(before)).not.toMatch(/correctChoiceIds|prompt|answerStamp|clipboard/);
  const explanation = await student.mutation(api.examInvigilation.explainEvent, {
    attemptId, eventId: "event-human-review", expectedRevision: 0,
    explanation: "The mobile operating system briefly switched applications.",
  });
  expect(explanation).toEqual({ revision: 1, disposition: "needs_review" });
  await expect(student.mutation(api.examInvigilation.explainEvent, {
    attemptId, eventId: "event-human-review", expectedRevision: 0,
    explanation: "This stale update must fail without losing the first response.",
  })).rejects.toThrow("REVISION_CONFLICT");
  expect((await student.query(api.examInvigilation.myReport, { attemptId }))[0])
    .toMatchObject({ revision: 1, disposition: "needs_review" });
  await owner.mutation(api.examInvigilation.reviewEvent, {
    attemptId, eventId: "event-human-review", expectedRevision: 1,
    disposition: "no_action", reason: "No actionable issue; normal mobile interruption.",
  });
  await expect(student.mutation(api.examInvigilation.reviewEvent, {
    attemptId, eventId: "event-human-review", expectedRevision: 2,
    disposition: "policy_issue", reason: "Unauthorized student review must be rejected.",
  })).rejects.toThrow("NOT_FOUND");
  const final = await owner.query(api.examInvigilation.report, { attemptId });
  expect(final.cases[0]).toMatchObject({ revision: 2, disposition: "no_action" });
  expect(final.audit.map(a => a.action)).toContain("student_explanation");
  expect(final.audit.map(a => a.action)).toContain("reviewed");
  expect((await t.run(ctx => ctx.db.get("examAttempts", attemptId)))?.state)
    .toBe("in_progress");
});

it("requires explicit teacher authorization for pre-start accommodations", async () => {
  const { t, owner, student, releaseId, attemptId } = await fixture();
  // Lookup without relying on a mutable course route or a client-supplied role.
  const sealed = await t.run(ctx => ctx.db.get("examAttempts", attemptId));
  const snap = sealed && await t.run(ctx => ctx.db.get("examSnapshots", sealed.snapshotId));
  expect(snap).not.toBeNull();
  const draftId = snap!.draftId;
  await t.run(ctx => ctx.db.patch("examAttempts", attemptId, { state: "expired" }));
  await expect(student.mutation(api.examInvigilation.setAccommodation, {
    draftId, studentId: otherCreatorIdentity.subject,
    kind: "extra_time", additionalMinutes: 20, expectedRevision: 0,
  })).rejects.toThrow("NOT_FOUND");
  const saved = await owner.mutation(api.examInvigilation.setAccommodation, {
    draftId, studentId: otherCreatorIdentity.subject,
    kind: "extra_time", additionalMinutes: 20, expectedRevision: 0,
  });
  expect(saved).toEqual({ revision: 1, appliedToActiveAttempt: false });
  expect(await student.query(api.examInvigilation.myAccommodation, { releaseId }))
    .toMatchObject({ kind: "extra_time", additionalMinutes: 20 });
  expect(await owner.query(api.examInvigilation.teacherAccommodation, {
    draftId, studentId: otherCreatorIdentity.subject,
  })).toMatchObject({ revision: 1 });
  const storedAttempt = await t.run(ctx => ctx.db.get("examAttempts", attemptId));
  expect(storedAttempt?.deadlineAt).toBe(sealed?.deadlineAt);
  const audit = await t.run(ctx => ctx.db.query("examAccommodationAudit")
    .withIndex("by_release_at", q => q.eq("releaseId", releaseId)).collect());
  expect(audit).toHaveLength(1);
  await expect(owner.mutation(api.examInvigilation.setAccommodation, {
    draftId, studentId: otherCreatorIdentity.subject,
    kind: "extra_time", additionalMinutes: 60, expectedRevision: 0,
  })).rejects.toThrow("REVISION_CONFLICT");
});

it("audits manual time extensions without reopening expired attempts or punishing telemetry", async () => {
  const { t, owner, student, attemptId } = await enabledFixture("warn");
  const before = await t.run(ctx => ctx.db.get("examAttempts", attemptId));
  const extended = await owner.mutation(api.examInvigilation.extendTime, {
    attemptId, expectedRevision: 0, minutes: 5,
    reason: "Verified connection interruption and human-approved additional time.",
  });
  expect(extended).toMatchObject({ revision: 1, deadlineAt: before!.deadlineAt! + 300_000 });
  expect(await t.mutation(internal.examSubmissions.finalizeAtDeadline, {
    attemptId, deadlineAt: before!.deadlineAt!,
  })).toBeNull();
  await expect(student.mutation(api.examInvigilation.extendTime, {
    attemptId, expectedRevision: 1, minutes: 5,
    reason: "A candidate may not extend their own exam deadline.",
  })).rejects.toThrow("NOT_FOUND");
  await expect(owner.mutation(api.examInvigilation.extendTime, {
    attemptId, expectedRevision: 0, minutes: 5,
    reason: "Stale teacher intervention must fail with revision conflict.",
  })).rejects.toThrow("REVISION_CONFLICT");
  await owner.mutation(api.examInvigilation.noteIntervention, {
    attemptId, kind: "connectivity_acknowledged",
    reason: "Connection problem investigated; no adverse action recorded.",
  });
  const report = await owner.query(api.examInvigilation.report, { attemptId });
  expect(report.audit.map(a => a.action)).toContain("time_extension");
  expect(report.audit.map(a => a.action)).toContain("connectivity_acknowledged");
  expect((await t.run(ctx => ctx.db.get("examAttempts", attemptId)))?.state)
    .toBe("in_progress");
});
