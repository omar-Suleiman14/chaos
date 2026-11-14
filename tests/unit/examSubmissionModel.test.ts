import { describe, expect, it } from "vitest";
import { defaultExamSettings } from "../../convex/examSettingsModel";
import {
  countExamAnswers, createExamAttemptTiming, examAnswerRevisionStamp,
  requireExamAttemptTiming, requireManualSubmissionAllowed,
} from "../../convex/examSubmissionModel";

const startedAt = 1_700_000_000_000;

describe("authoritative exam timing", () => {
  it("uses server start time and caps a scheduled exam at the release close", () => {
    const timing = createExamAttemptTiming({
      ...defaultExamSettings, mode: "scheduled", durationMinutes: 60,
      opensAt: startedAt - 1_000, closesAt: startedAt + 10 * 60_000,
    }, startedAt);
    expect(timing.deadlineAt).toBe(startedAt + 600_000);
    expect(timing.minimumSubmitAt).toBe(startedAt + 30_000);
    expect(timing.submissionPolicy).toMatchObject({
      allowEarlySubmission: true, timeoutAction: "auto_submit",
    });
    expect(() => createExamAttemptTiming({
      ...defaultExamSettings, mode: "scheduled",
      opensAt: startedAt + 1, closesAt: startedAt + 60_000,
    }, startedAt)).toThrow("EXAM_CLOSED");
  });

  it("refuses missing or corrupt timing rather than treating legacy attempts as untimed", () => {
    expect(() => requireExamAttemptTiming({ startedAt })).toThrow("EXAM_CLOCK_NOT_CONFIGURED");
    expect(() => requireExamAttemptTiming({
      startedAt, ...createExamAttemptTiming(defaultExamSettings, startedAt),
      deadlineAt: startedAt - 1,
    })).toThrow("EXAM_CLOCK_NOT_CONFIGURED");
  });

  it("enforces minimum time, all answers and no-early-submit policy on the server", () => {
    const clock = { startedAt, ...createExamAttemptTiming({
      ...defaultExamSettings, requireAllAnswers: true,
    }, startedAt) };
    expect(() => requireManualSubmissionAllowed(clock, startedAt + 1_000, 1, 1))
      .toThrow("MINIMUM_SUBMISSION_TIME");
    expect(() => requireManualSubmissionAllowed(clock, startedAt + 30_000, 0, 1))
      .toThrow("ANSWERS_REQUIRED");
    expect(() => requireManualSubmissionAllowed(clock, startedAt + 30_000, 1, 1))
      .not.toThrow();
    expect(() => requireManualSubmissionAllowed(clock, clock.deadlineAt, 1, 1))
      .toThrow("ATTEMPT_TIMED_OUT");
    const noEarly = { startedAt, ...createExamAttemptTiming({
      ...defaultExamSettings, allowEarlySubmission: false,
    }, startedAt) };
    expect(() => requireManualSubmissionAllowed(noEarly, startedAt + 31_000, 1, 1))
      .toThrow("EARLY_SUBMISSION_DISABLED");
  });

  it("counts actual answers and invalidates confirmation after any revision", () => {
    const initial = [{ questionIndex: 0, revision: 1, choiceIds: ["a"], text: "" },
      { questionIndex: 1, revision: 1, choiceIds: [], text: "   " }];
    expect(countExamAnswers(initial)).toBe(1);
    expect(examAnswerRevisionStamp(initial))
      .not.toBe(examAnswerRevisionStamp([{ ...initial[0], revision: 2 }, initial[1]]));
    expect(examAnswerRevisionStamp([...initial].reverse())).toBe(examAnswerRevisionStamp(initial));
  });
});
