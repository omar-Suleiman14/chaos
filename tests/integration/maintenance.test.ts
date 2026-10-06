import { expect, it } from "vitest";
import { internal } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { MAINTENANCE_POLICY } from "@/convex/maintenance";

const DAY = 86_400_000;
const metadata = { title: "Lesson", description: "", language: "en", tags: [] };
const document = { schemaVersion: 1 as const, blocks: [{ id: "b1", type: "paragraph" as const, text: "Text", citations: [], conceptIds: [] }] };

it("sweeps expired housekeeping rows and keeps everything still in use", async () => {
  const t = createTestConvex();
  const now = Date.now();
  const old = (days: number) => now - (days + 1) * DAY;
  const ids = await t.run(async (ctx) => {
    const lessonId = await ctx.db.insert("lessons", { ownerId: "owner", metadata, draft: document, revision: 3, status: "active", visibility: "private", communityState: "ok", createdAt: 0, updatedAt: 0, searchText: "" });
    const versionId = await ctx.db.insert("lessonVersions", { lessonId, number: 1, metadata, document, authorId: "owner", publishedAt: 0 });
    const view = (recordedAt: number) => ctx.db.insert("learnCommunityViews", { lessonId, userKey: "u", day: Math.floor(recordedAt / DAY), versionId, blockId: "b1", recordedAt });
    const teamId = await ctx.db.insert("businessTeams", { name: "Team", ownerId: "owner", createdAt: 0 });
    const invite = (expiresAt: number) => ctx.db.insert("businessInvites", { teamId, tokenHash: String(expiresAt), role: "member", invitedBy: "owner", expiresAt, createdAt: 0 });
    const copy = (revision: number, savedAt: number) => ctx.db.insert("lessonDraftRecovery", { lessonId, revision, metadata, document, savedAt });
    return {
      oldView: await view(old(MAINTENANCE_POLICY.communityViewsDays)), freshView: await view(now),
      oldInvite: await invite(old(MAINTENANCE_POLICY.expiredInvitesDays)), recentlyExpired: await invite(now - DAY), openInvite: await invite(now + DAY),
      oldCopy: await copy(1, old(MAINTENANCE_POLICY.draftRecoveryDays)), newestOldCopy: await copy(2, old(MAINTENANCE_POLICY.draftRecoveryDays)),
    };
  });

  expect(await t.mutation(internal.maintenance.sweep, {})).toEqual({ views: 1, invites: 1, recovery: 1 });
  const exists = await t.run(async (ctx) => Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([key, id]) => [key, (await ctx.db.get(id as never)) !== null]))));
  expect(exists).toEqual({ oldView: false, freshView: true, oldInvite: false, recentlyExpired: true, openInvite: true, oldCopy: false, newestOldCopy: true });
  // A second run finds nothing more to do: the newest copy of a lesson is kept however old.
  expect(await t.mutation(internal.maintenance.sweep, {})).toEqual({ views: 0, invites: 0, recovery: 0 });
});
