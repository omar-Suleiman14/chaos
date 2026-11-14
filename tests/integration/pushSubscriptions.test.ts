import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());
const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  p256dh: "A".repeat(87),
  auth: "B".repeat(22),
  locale: "en" as const,
};

it("allows consent only for a signed-in account and forbids SSRF endpoints", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  await expect(t.mutation(api.pushSubscriptions.subscribe, subscription)).rejects.toThrow();
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await expect(owner.mutation(api.pushSubscriptions.subscribe, {
    ...subscription, endpoint: "https://127.0.0.1/a",
  })).rejects.toThrow("INVALID_PUSH_SUBSCRIPTION");
  await owner.mutation(api.pushSubscriptions.subscribe, subscription);
  expect(await owner.query(api.pushSubscriptions.enabledOnDevice, { endpoint: subscription.endpoint })).toBe(true);
  const other = t.withIdentity(otherCreatorIdentity);
  await other.mutation(api.quizFunctions.getOrCreateUser, {});
  expect(await other.query(api.pushSubscriptions.enabledOnDevice, { endpoint: subscription.endpoint })).toBe(false);
  await other.mutation(api.pushSubscriptions.unsubscribe, { endpoint: subscription.endpoint });
  expect(await owner.query(api.pushSubscriptions.enabledOnDevice, { endpoint: subscription.endpoint })).toBe(true);
  await owner.mutation(api.pushSubscriptions.unsubscribe, { endpoint: subscription.endpoint });
  expect(await owner.query(api.pushSubscriptions.enabledOnDevice, { endpoint: subscription.endpoint })).toBe(false);
});

it("transfers a shared browser endpoint on account change without cross-account delivery", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const first = t.withIdentity(creatorIdentity), second = t.withIdentity(otherCreatorIdentity);
  await first.mutation(api.quizFunctions.getOrCreateUser, {});
  await second.mutation(api.quizFunctions.getOrCreateUser, {});
  await first.mutation(api.pushSubscriptions.subscribe, subscription);
  await second.mutation(api.pushSubscriptions.subscribe, { ...subscription, locale: "ar" });
  expect(await first.query(api.pushSubscriptions.enabledOnDevice, { endpoint: subscription.endpoint })).toBe(false);
  expect(await second.query(api.pushSubscriptions.enabledOnDevice, { endpoint: subscription.endpoint })).toBe(true);
  const notice = await t.run(ctx => ctx.db.insert("notifications", {
    ownerId: creatorIdentity.subject, kind: "approval", message: "Secret internal title",
    dedupeKey: "transfer-private", createdAt: Date.now(),
  }));
  expect(await t.query(internal.pushSubscriptions.deliveryTargets, { notificationId: notice })).toEqual([]);
});
