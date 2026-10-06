import { expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { createTestConvex, createTestConvexWithAdmin } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

it("only administrators change rollouts, and only for declared flags", async () => {
  const t = await createTestConvexWithAdmin(creatorIdentity.subject);
  const admin = t.withIdentity(creatorIdentity), other = t.withIdentity(otherCreatorIdentity);
  await expect(other.mutation(api.flags.setRollout, { key: "editor.new", rollout: { percent: 100 } })).rejects.toThrow(/admin access required/);
  await expect(admin.mutation(api.flags.setRollout, { key: "made.up", rollout: { percent: 100 } })).rejects.toThrow(/UNKNOWN_FLAG/);
  await expect(admin.mutation(api.flags.setRollout, { key: "editor.new", rollout: { percent: 101 } })).rejects.toThrow(/VALIDATION_FAILED/);

  expect((await other.query(api.flags.mine, {}))["editor.new"]).toBe(false);
  await admin.mutation(api.flags.setRollout, { key: "editor.new", rollout: { percent: 0, allow: [otherCreatorIdentity.subject] } });
  expect((await other.query(api.flags.mine, {}))["editor.new"]).toBe(true);
  expect((await admin.query(api.flags.mine, {}))["editor.new"]).toBe(false);
  expect((await t.query(internal.flags.forUser, { userId: otherCreatorIdentity.subject }))["editor.new"]).toBe(true);

  // Signed-out visitors only see a flag at 100%.
  expect((await t.query(api.flags.mine, {}))["editor.new"]).toBe(false);
  await admin.mutation(api.flags.setRollout, { key: "editor.new", rollout: { percent: 100 } });
  expect((await t.query(api.flags.mine, {}))["editor.new"]).toBe(true);
  expect(await admin.query(api.flags.list, {})).toContainEqual(expect.objectContaining({ key: "editor.new", percent: 100, allow: 1 }));

  await admin.mutation(api.flags.setRollout, { key: "editor.new", rollout: null });
  expect((await t.query(api.flags.mine, {}))["editor.new"]).toBe(false);
});

it("returns defaults for everyone without rollouts", async () => {
  const t = createTestConvex();
  const flags = await t.query(api.flags.mine, {});
  expect(Object.values(flags).every((value) => value === false)).toBe(true);
});
