import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";
import { measureConvex } from "../../perf/lib/convex";
import { fingerprintBytes, SOURCE_SIMILARITY_LIMITS } from "../../convex/sourceFingerprint";

const register = makeFunctionReference<"mutation">("learnSources:registerUpload");
const body = Uint8Array.from({ length: 512 * 32 }, (_, i) => (i * 31 + Math.floor(i / 13)) % 251);
const candidateFingerprint = fingerprintBytes(body);
const newcomer = Uint8Array.from({ length: body.length }, (_, i) => (i * 17 + Math.floor(i / 7)) % 251);

async function measuredRegistration(count: number) {
  const t = createTestConvex();
  await t.run(async (ctx) => {
    await ctx.db.insert("sourceStorageUsage", { ownerId: creatorIdentity.subject, bytes: 0 });
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("learnSources", {
        ownerId: creatorIdentity.subject,
        uploadedBy: creatorIdentity.subject,
        metadata: { title: "Historical notes", kind: "file", origin: "Personal" },
        metadataVisibility: "private",
        contentVisibility: "private",
        sha256: `historical-sha-${i}`,
        size: body.length,
        contentType: "text/plain",
        fingerprint: candidateFingerprint,
        createdAt: i,
        status: "active",
        storageCounted: true,
      });
    }
  });
  const storageId = await t.run(ctx => ctx.storage.store(new Blob([new Uint8Array(newcomer).buffer], { type: "text/plain" })));
  return measureConvex(() => t.withIdentity(creatorIdentity).mutation(register, {
    storageId,
    contentType: "text/plain",
    fingerprint: fingerprintBytes(newcomer),
    metadata: { title: "New notes", kind: "file", origin: "Personal" },
    metadataVisibility: "private",
    contentVisibility: "private",
  }));
}

describe("source near-duplicate candidate query cost", () => {
  it("reads a bounded owner/type/status index window beyond 100 historical files", async () => {
    const small = await measuredRegistration(SOURCE_SIMILARITY_LIMITS.candidates);
    const large = await measuredRegistration(SOURCE_SIMILARITY_LIMITS.candidates * 3);
    expect(small.result.duplicate).toBe(false);
    expect(large.result.duplicate).toBe(false);
    expect(large.cost.documentsRead).toBeLessThanOrEqual(small.cost.documentsRead);
    expect(large.cost.databaseQueries).toBe(small.cost.databaseQueries);
    // Observational metrics are logged for maintainers, not tested as unstable wall-clock thresholds.
    console.info("source similarity indexed read cost", {
      atLimit: { candidates: SOURCE_SIMILARITY_LIMITS.candidates, documentsRead: small.cost.documentsRead, databaseQueries: small.cost.databaseQueries, bytesRead: small.cost.bytesRead },
      tripleLimit: { candidates: SOURCE_SIMILARITY_LIMITS.candidates * 3, documentsRead: large.cost.documentsRead, databaseQueries: large.cost.databaseQueries, bytesRead: large.cost.bytesRead },
    });
  });
});
