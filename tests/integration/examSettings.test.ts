import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";
import { defaultExamSettings } from "../../convex/examSettingsModel";

afterEach(() => vi.unstubAllEnvs());

async function setup() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const doctor = t.withIdentity(creatorIdentity);
  const stranger = t.withIdentity(otherCreatorIdentity);
  await doctor.mutation(api.quizFunctions.getOrCreateUser, {});
  await stranger.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await doctor.mutation(api.courses.create, { title: "Cardiology" });
  const questionId = await doctor.mutation(api.questionBank.createForCourse, {
    courseId, item: {
      kind: "single_choice", prompt: "What is S1?",
      choices: [{ id: "a", text: "AV valves close" }, { id: "b", text: "Semilunar valves close" }],
      correctChoiceIds: ["a"], points: 1, topics: [], terms: [], outcomes: [],
      status: "ready",
    },
  });
  const draftId = await doctor.mutation(api.examBuilder.createDraft, { courseId });
  await doctor.mutation(api.examBuilder.savePlan, {
    draftId, expectedRevision: 0, title: "Heart sounds", targetCount: 1,
    allocations: [{ id: "all", kind: "course", key: "", count: 1, points: 1 }],
  });
  await doctor.mutation(api.examBuilder.setSelections, {
    draftId, expectedRevision: 1, selections: [{ questionId, allocationId: "all" }],
  });
  return { t, doctor, stranger, draftId, courseId };
}
it("doctor-only policy creation requires a sealed snapshot and never enables students", async () => {
  const { doctor, stranger, draftId } = await setup();
  const defaults = await doctor.query(api.examSettings.getForDraft, { draftId });
  expect(defaults.settings).toEqual(defaultExamSettings);
  expect(defaults.snapshotId).toBeNull();
  await expect(stranger.query(api.examSettings.getForDraft, { draftId })).rejects.toThrow("NOT_FOUND");
  await expect(doctor.mutation(api.examSettings.saveForDraft, {
    draftId, expectedRevision: 0, settings: defaultExamSettings,
  })).rejects.toThrow("SNAPSHOT_REQUIRED");
  const { snapshotId } = await doctor.mutation(api.examRuntime.sealDraft, { draftId, expectedRevision: 2 });
  await expect(stranger.mutation(api.examSettings.saveForDraft, {
    draftId, expectedRevision: 0, settings: defaultExamSettings,
  })).rejects.toThrow("NOT_FOUND");
  expect(await doctor.mutation(api.examSettings.saveForDraft, {
    draftId, expectedRevision: 0, settings: defaultExamSettings,
  })).toBe(1);
  expect(await doctor.mutation(api.examSettings.setPrepared, {
    draftId, expectedRevision: 1, prepared: true,
  })).toBe(2);
  const status = await doctor.query(api.examSettings.getForDraft, { draftId });
  expect(status).toMatchObject({ preparedForAudience: true, studentEntryEnabled: false, revision: 2 });
  expect(status).not.toHaveProperty("questions");
  await expect(stranger.mutation(api.examRuntime.startAttempt, { snapshotId }))
    .rejects.toThrow("EXAM_NOT_ASSIGNED");
});
it("rejects invalid windows, stale writes and resets preparation on any policy edit", async () => {
  const { doctor, draftId } = await setup();
  await doctor.mutation(api.examRuntime.sealDraft, { draftId, expectedRevision: 2 });
  const now = Date.now();
  const schedule = {
    ...defaultExamSettings, mode: "scheduled" as const,
    opensAt: now + 3600000, closesAt: now + 7200000,
    resultVisibility: "after_close" as const, passingPercent: 70,
  };
  await expect(doctor.mutation(api.examSettings.saveForDraft, {
    draftId, expectedRevision: 0, settings: { ...schedule, closesAt: now - 1 },
  })).rejects.toThrow("Closing time");
  await doctor.mutation(api.examSettings.saveForDraft, {
    draftId, expectedRevision: 0, settings: schedule,
  });
  await expect(doctor.mutation(api.examSettings.saveForDraft, {
    draftId, expectedRevision: 0, settings: schedule,
  })).rejects.toThrow("REVISION_CONFLICT");
  await doctor.mutation(api.examSettings.setPrepared, {
    draftId, expectedRevision: 1, prepared: true,
  });
  await doctor.mutation(api.examSettings.saveForDraft, {
    draftId, expectedRevision: 2, settings: { ...schedule, passingPercent: 75 },
  });
  const status = await doctor.query(api.examSettings.getForDraft, { draftId });
  expect(status.settings.passingPercent).toBe(75);
  expect(status.preparedForAudience).toBe(false);
  expect(status.studentEntryEnabled).toBe(false);
});
it("requires a fresh sealed draft revision before preparing and resets preparation on reseal", async () => {
  const { doctor, draftId } = await setup();
  await doctor.mutation(api.examRuntime.sealDraft, { draftId, expectedRevision: 2 });
  await doctor.mutation(api.examSettings.saveForDraft, {
    draftId, expectedRevision: 0, settings: defaultExamSettings,
  });
  await doctor.mutation(api.examBuilder.savePlan, {
    draftId, expectedRevision: 2, title: "Heart sounds revised", targetCount: 1,
    allocations: [{ id: "all", kind: "course", key: "", count: 1, points: 1 }],
  });
  await expect(doctor.mutation(api.examSettings.setPrepared, {
    draftId, expectedRevision: 1, prepared: true,
  })).rejects.toThrow("STALE_SNAPSHOT");
  const second = await doctor.mutation(api.examRuntime.sealDraft, {
    draftId, expectedRevision: 3,
  });
  expect(second.version).toBe(2);
  await doctor.mutation(api.examSettings.setPrepared, {
    draftId, expectedRevision: 1, prepared: true,
  });
  expect((await doctor.query(api.examSettings.getForDraft, { draftId })).preparedForAudience).toBe(true);
  await doctor.mutation(api.examBuilder.savePlan, {
    draftId, expectedRevision: 3, title: "Heart sounds final", targetCount: 1,
    allocations: [{ id: "all", kind: "course", key: "", count: 1, points: 1 }],
  });
  await doctor.mutation(api.examRuntime.sealDraft, { draftId, expectedRevision: 4 });
  expect((await doctor.query(api.examSettings.getForDraft, { draftId })).preparedForAudience).toBe(false);
});
