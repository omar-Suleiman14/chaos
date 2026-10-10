import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import componentTest from "@convex-dev/better-auth/test";
import authSchema from "@/convex/betterAuth/schema";
import { createTestConvex } from "./setup";
import { api, internal } from "@/convex/_generated/api";
import { makeFunctionReference } from "convex/server";
import { emptyDefinition } from "@/convex/formLogic";
import { defaultFormSettings } from "@/convex/formModel";
import { oidcActorId } from "@/lib/auth/identity";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

// Password hashing and RSA key generation need headroom on shared CI runners.
vi.setConfig({ testTimeout: 30_000 });
type T = ReturnType<typeof createTestConvex>;
const hw = (name: string) => makeFunctionReference<"mutation">(`homework:${name}`);
const attemptDefinition = makeFunctionReference<"query">("homework:getAttemptDefinition");

/** A teacher-owned published quiz assignment. */
async function assignment(t: T, teacher: ReturnType<T["withIdentity"]>, teacherId: string) {
  const ids = await t.run(async (ctx) => {
    if (!await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", teacherId)).first())
      await ctx.db.insert("users", { clerkId: teacherId, name: "Teacher", email: "teacher@school.test", username: "teacher", createdAt: 0 });
    const def = emptyDefinition("Exam"); def.quiz = { enabled: true };
    def.fields = [{ id: "q", type: "choice", label: "Private exam question", required: true, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], quiz: { correctOptionIds: ["a"], points: 1 } }];
    const formId = await ctx.db.insert("forms", { ownerId: teacherId, title: "Exam", shareId: `exam-${Math.random().toString(36).slice(2)}`, status: "live", draft: def, draftRevision: 1, settings: defaultFormSettings, publishedVersion: 1, responseCount: 0, partialCount: 0, createdAt: 0, updatedAt: 0 });
    const versionId = await ctx.db.insert("formVersions", { formId, version: 1, definition: def, publishedAt: 0, publishedBy: "teacher", draftRevision: 1 });
    return { formId, versionId };
  });
  const now = Date.now();
  return await teacher.mutation(hw("create"), { ...ids, title: "Exam", opensAt: now - 1000, deadline: now + 600_000, maxAttempts: 1 });
}

describe("Better Auth: an unverified address never grants homework access", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.stubEnv("CHAOS_AUTH_PROVIDER", "betterauth");
    vi.stubEnv("CHAOS_APP_URL", "https://chaos.example.test");
    vi.stubEnv("CONVEX_SITE_URL", "https://backend.example.test");
    vi.stubEnv("BETTER_AUTH_SECRET", "synthetic-auth-test-secret-at-least-32-characters");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("registers a squatted address unverified, and enroll-by-email refuses it", async () => {
    const t = createTestConvex();
    t.registerComponent("betterAuth", authSchema, {
      ...componentTest.modules,
      "./component/adapter.ts": () => import("@/convex/betterAuth/adapter"),
      "./component/refresh.ts": () => import("@/convex/betterAuth/refresh"),
    });
    const post = (path: string, body: unknown) => t.fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://chaos.example.test" }, body: JSON.stringify(body) });
    const credentials = { email: "student@school.test", password: "synthetic-password-123" };
    // Anyone can register an address they do not own; it stays unverified.
    const registered = await post("/api/auth/sign-up/email", { name: "Someone", ...credentials });
    expect(registered.status).toBe(200);
    expect((await registered.json()).user.emailVerified).toBe(false);
    const login = await post("/api/auth/sign-in/email", credentials);
    const cookies = login.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
    const token = (await (await t.fetch("/api/auth/convex/token", { headers: { Cookie: cookies } })).json()).token as string;
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(claims).toMatchObject({ email: "student@school.test", emailVerified: false });
    // Convex exposes those claims as the identity; the account syncs its profile.
    const squatter = t.withIdentity({ subject: claims.sub, issuer: claims.iss, tokenIdentifier: `${claims.iss}|${claims.sub}`, email: claims.email, emailVerified: claims.emailVerified });
    await squatter.mutation(api.quizFunctions.getOrCreateUser, {});
    expect((await squatter.query(api.quizFunctions.getCurrentUser, {}))).toMatchObject({ email: "student@school.test", emailVerified: false });

    const teacherSubject = "teacher_subject";
    const teacher = t.withIdentity({ subject: teacherSubject, issuer: claims.iss, tokenIdentifier: `${claims.iss}|${teacherSubject}` });
    const assignmentId = await assignment(t, teacher, await oidcActorId(claims.iss, teacherSubject));
    await expect(teacher.mutation(hw("enroll"), { assignmentId, email: "student@school.test", active: true })).rejects.toThrow("NOT_FOUND");
    expect(await t.run((ctx) => ctx.db.query("homeworkEnrollments").collect())).toHaveLength(0);
    await expect(squatter.mutation(hw("startAttempt"), { assignmentId })).rejects.toThrow();
  });
});

describe("Clerk and MCP accounts", () => {
  it("binds enroll-by-email and grantAdmin only to a verified address, whichever account came first", async () => {
    const t = createTestConvex();
    // The squatter signs up first with the student's address, unverified.
    const squatter = t.withIdentity({ ...otherCreatorIdentity, email: "student@school.test", emailVerified: false });
    await squatter.mutation(api.quizFunctions.getOrCreateUser, {});
    const studentIdentity = { ...creatorIdentity, subject: "user_student", tokenIdentifier: `${creatorIdentity.issuer}|user_student`, email: "student@school.test", emailVerified: true };
    const teacher = t.withIdentity({ ...creatorIdentity, subject: "user_teacher", tokenIdentifier: `${creatorIdentity.issuer}|user_teacher` });
    const assignmentId = await assignment(t, teacher, "user_teacher");
    await expect(teacher.mutation(hw("enroll"), { assignmentId, email: "student@school.test", active: true })).rejects.toThrow("NOT_FOUND");
    await expect(t.mutation(internal.admin.grantAdmin, { email: "student@school.test" })).rejects.toThrow("USER_NOT_FOUND");

    // The real student signs in with a verified address and is the one enrolled.
    const student = t.withIdentity(studentIdentity);
    await student.mutation(api.quizFunctions.getOrCreateUser, {});
    await teacher.mutation(hw("enroll"), { assignmentId, email: "Student@School.test", active: true });
    expect((await t.run((ctx) => ctx.db.query("homeworkEnrollments").collect())).map((e) => e.studentId)).toEqual(["user_student"]);
    const attemptId = await student.mutation(hw("startAttempt"), { assignmentId });
    expect(JSON.stringify(await student.query(attemptDefinition, { attemptId }))).toContain("Private exam question");
    await expect(squatter.mutation(hw("startAttempt"), { assignmentId })).rejects.toThrow();
    expect((await t.mutation(internal.admin.grantAdmin, { email: "student@school.test" })).clerkId).toBe("user_student");

    // Losing verification (for example a new, unverified address) withdraws the binding.
    await t.withIdentity({ ...studentIdentity, email: "new@school.test", emailVerified: false }).mutation(api.quizFunctions.getOrCreateUser, {});
    expect(await t.run(async (ctx) => (await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", "user_student")).first())?.emailVerified)).toBe(false);
  });

  it("MCP first use records whether the provider verified the address", async () => {
    const t = createTestConvex();
    await t.mutation(internal.mcp.begin, { userId: "user_mcp_unverified", profile: { name: "A", email: "mcp@school.test", emailVerified: false } });
    await t.mutation(internal.mcp.begin, { userId: "user_mcp_legacy", profile: { name: "B", email: "mcp@school.test" } });
    const teacher = t.withIdentity({ ...creatorIdentity, subject: "user_teacher", tokenIdentifier: `${creatorIdentity.issuer}|user_teacher` });
    const assignmentId = await assignment(t, teacher, "user_teacher");
    await expect(teacher.mutation(hw("enroll"), { assignmentId, email: "mcp@school.test", active: true })).rejects.toThrow("NOT_FOUND");
    await t.mutation(internal.mcp.begin, { userId: "user_mcp_verified", profile: { name: "C", email: "mcp@school.test", emailVerified: true } });
    await teacher.mutation(hw("enroll"), { assignmentId, email: "mcp@school.test", active: true });
    expect((await t.run((ctx) => ctx.db.query("homeworkEnrollments").collect())).map((e) => e.studentId)).toEqual(["user_mcp_verified"]);
  });
});
