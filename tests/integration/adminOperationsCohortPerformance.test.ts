import { expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvexWithAdmin } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

it("pages a shared-course cohort without leaking content or stale course titles", async () => {
  const t = await createTestConvexWithAdmin(creatorIdentity.subject);
  const courseId = await t.run(async ctx => {
    const id = await ctx.db.insert("learnCollections", {
      ownerId: otherCreatorIdentity.subject,
      metadata: {
        title: "First title", description: "PRIVATE_DESCRIPTION_DO_NOT_EXPOSE",
        language: "en", tags: [],
      },
      items: [], lessonIds: [], revision: 0, visibility: "private",
      communityState: "ok", createdAt: 1, updatedAt: 1,
    });
    for (let i = 0; i < 75; i++) {
      await ctx.db.insert("courseJoinRequests", {
        courseId: id,
        ownerId: otherCreatorIdentity.subject,
        studentId: `student-${i}`,
        status: "pending",
        requestedAt: i + 2, updatedAt: i + 2,
      });
    }
    return id;
  });
  const admin = t.withIdentity(creatorIdentity);
  const pageOne = await admin.query(api.adminOperations.admissions, {
    status: "pending", paginationOpts: { cursor: null, numItems: 25 },
  });
  expect(pageOne.page).toHaveLength(25);
  expect(pageOne.page.every(row => row.courseTitle === "First title")).toBe(true);
  expect(pageOne.isDone).toBe(false);

  await t.run(async ctx => {
    const course = await ctx.db.get("learnCollections", courseId);
    if (!course) throw new Error("Test course disappeared");
    await ctx.db.patch("learnCollections", courseId, {
      metadata: { ...course.metadata, title: "Renamed title" },
    });
  });
  const pageTwo = await admin.query(api.adminOperations.admissions, {
    status: "pending",
    paginationOpts: { cursor: pageOne.continueCursor, numItems: 25 },
  });
  expect(pageTwo.page).toHaveLength(25);
  expect(pageTwo.page.every(row => row.courseTitle === "Renamed title")).toBe(true);
  expect(new Set([...pageOne.page, ...pageTwo.page].map(row => row.id)).size).toBe(50);
  expect(JSON.stringify([pageOne, pageTwo])).not.toContain("PRIVATE_DESCRIPTION_DO_NOT_EXPOSE");

  await expect(t.withIdentity(otherCreatorIdentity).query(api.adminOperations.admissions, {
    status: "pending", paginationOpts: { cursor: null, numItems: 25 },
  })).rejects.toThrow(/forbidden|admin access required/i);
});
