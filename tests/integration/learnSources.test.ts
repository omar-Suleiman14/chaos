/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  httpRouter,
  makeFunctionReference,
  type FunctionReference,
  type FunctionType,
} from "convex/server";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { createTestConvex } from "./setup";
import {
  registerSourceRoutes,
  SOURCE_CONTENT_PATH,
  SOURCE_UPLOAD_PATH,
  upload,
} from "../../convex/learnSources";
import type { Id } from "../../convex/_generated/dataModel";
const ref = <T extends FunctionType>(
  name: string,
  type: T,
): FunctionReference<T> => {
  void type;
  return makeFunctionReference(`learnSources:${name}`);
};
const create = ref("create", "mutation");
const metadata = ref("getMetadata", "query");
const content = ref("getContentUrl", "query");
const grant = ref("setGrant", "mutation");
const register = ref("registerUpload", "mutation");
const update = ref("update", "mutation");
const remove = ref("remove", "mutation");
const ownerIdentity = { subject: "owner", issuer: "https://clerk.test" };
const otherIdentity = { subject: "other", issuer: "https://clerk.test" };
const sourceMeta = {
  title: "Source",
  origin: "Library",
  kind: "reference" as const,
};
const handler = (
  upload as typeof upload & {
    _handler: Parameters<
      typeof import("../../convex/_generated/server").httpAction
    >[0];
  }
)._handler;
const modules = import.meta.glob("../../convex/**/*.*s");
function createProxyConvex() {
  const http = httpRouter();
  registerSourceRoutes(http);
  // Exercise real HTTP dispatch/auth without taking ownership of the app router.
  return convexTest(schema, {
    ...modules,
    "../../convex/http.ts": async () => ({ default: http }),
  });
}
beforeEach(() => vi.stubEnv("CONVEX_SITE_URL", "https://test.convex.site"));
afterEach(() => vi.unstubAllEnvs());
async function serialResponse(
  ctx: Parameters<typeof handler>[0],
  req: Request,
) {
  const response = await handler(ctx, req);
  return { status: response.status, body: await response.text() };
}
function request(body: BodyInit = "hello", mime = "text/plain") {
  return new Request(
    "https://test.convex.site/upload?title=Source&origin=Library",
    { method: "POST", headers: { "Content-Type": mime }, body },
  );
}
function zipFixture(names: string[]) {
  const bytes: number[] = [];
  const write = (value: number, length: number) => {
    for (let i = 0; i < length; i++) bytes.push((value >>> (8 * i)) & 255);
  };
  const entries: { name: string; offset: number }[] = [];
  for (const name of names) {
    entries.push({ name, offset: bytes.length });
    write(0x04034b50, 4);
    write(20, 2);
    for (let i = 0; i < 20; i++) bytes.push(0);
    write(name.length, 2);
    write(0, 2);
    bytes.push(...Array.from(name, (c) => c.charCodeAt(0)));
  }
  const directory = bytes.length;
  for (const entry of entries) {
    write(0x02014b50, 4);
    write(20, 2);
    write(20, 2);
    for (let i = 0; i < 20; i++) bytes.push(0);
    write(entry.name.length, 2);
    for (let i = 0; i < 12; i++) bytes.push(0);
    write(entry.offset, 4);
    bytes.push(...Array.from(entry.name, (c) => c.charCodeAt(0)));
  }
  const directorySize = bytes.length - directory;
  write(0x06054b50, 4);
  write(0, 2);
  write(0, 2);
  write(names.length, 2);
  write(names.length, 2);
  write(directorySize, 4);
  write(directory, 4);
  write(0, 2);
  return new Uint8Array(bytes);
}
const pptxMime =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const pngBytes = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
// Signature checks are intentionally not a complete document/image decoder.
const signatureFixtures: { mime: string; bytes: Uint8Array<ArrayBuffer> }[] = [
  { mime: "image/png", bytes: pngBytes },
  {
    mime: "image/jpeg",
    bytes: new Uint8Array([
      255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 255, 217,
    ]),
  },
  {
    mime: "image/webp",
    bytes: new Uint8Array([
      82, 73, 70, 70, 8, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32,
    ]),
  },
  {
    mime: "application/pdf",
    bytes: new TextEncoder().encode("%PDF-1.7\n%%EOF\n"),
  },
  {
    mime: "application/vnd.ms-powerpoint",
    bytes: new Uint8Array([
      208,
      207,
      17,
      224,
      161,
      177,
      26,
      225,
      ...new Array<number>(504).fill(0),
    ]),
  },
  {
    mime: pptxMime,
    bytes: zipFixture(["[Content_Types].xml", "ppt/presentation.xml"]),
  },
];
async function seeded(t = createTestConvex()) {
  const sourceId = await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob(["hello"], { type: "text/plain" }),
    );
    return ctx.db.insert("learnSources", {
      ownerId: "owner",
      uploadedBy: "owner",
      metadata: { ...sourceMeta, kind: "file" },
      metadataVisibility: "public",
      contentVisibility: "private",
      storageId,
      sha256: "secret",
      createdAt: 0,
      status: "active",
    });
  });
  return { t, sourceId };
}
describe("learn source boundaries", () => {
  it("returns safe uploader attribution, immutable upload time/origin and an opaque fallback", async () => {
    const { t, sourceId } = await seeded();
    expect((await t.query(metadata, { sourceId })).provenance).toEqual({
      uploader: { kind: "opaque", ownerId: "owner" },
      uploadedAt: 0,
      origin: "Library",
    });
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "owner",
        name: "Public Name",
        username: "public-uploader",
        email: "private@test.com",
        createdAt: 123,
      }),
    );
    const result = await t.query(metadata, { sourceId });
    expect(result.provenance).toEqual({
      uploader: {
        kind: "profile",
        username: "public-uploader",
        name: "Public Name",
      },
      uploadedAt: 0,
      origin: "Library",
    });
    expect(JSON.stringify(result)).not.toContain("private@test.com");
    expect(result).not.toHaveProperty("uploadedBy");
    await t
      .withIdentity(ownerIdentity)
      .mutation(update, {
        sourceId,
        metadata: { ...sourceMeta, kind: "file", title: "Renamed" },
      });
    expect((await t.query(metadata, { sourceId })).provenance).toEqual(
      result.provenance,
    );
    await t.run((ctx) =>
      ctx.db.patch("users", userId, {
        name: "private@test.com",
        username: "private@test.com",
      }),
    );
    expect((await t.query(metadata, { sourceId })).provenance.uploader).toEqual(
      { kind: "opaque", ownerId: "owner" },
    );
    await t
      .withIdentity(ownerIdentity)
      .mutation(update, { sourceId, metadataVisibility: "private" });
    expect(await t.query(metadata, { sourceId })).toBeNull();
  });
  it("attributes the immutable uploadedBy identity rather than a different owner profile", async () => {
    const { t, sourceId } = await seeded();
    await t.run(async (ctx) => {
      await ctx.db.patch("learnSources", sourceId, {
        uploadedBy: "original-uploader",
      });
      await ctx.db.insert("users", {
        clerkId: "original-uploader",
        name: "Original Uploader",
        username: "original",
        email: "original@test.com",
        createdAt: 0,
      });
    });
    expect((await t.query(metadata, { sourceId })).provenance.uploader).toEqual(
      { kind: "profile", name: "Original Uploader", username: "original" },
    );
  });
  it("supports bearer CORS preflights and includes CORS on upload/download success and denial", async () => {
    const t = createProxyConvex(),
      owner = t.withIdentity(ownerIdentity);
    const origin = "https://ui.example.com";
    for (const [path, method] of [
      [SOURCE_UPLOAD_PATH, "POST"],
      [SOURCE_CONTENT_PATH, "GET"],
    ]) {
      const preflight = await t.fetch(path, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": method,
          "Access-Control-Request-Headers": "authorization, content-type",
        },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
      expect(preflight.headers.get("access-control-allow-headers")).toContain(
        "Authorization",
      );
      expect(
        preflight.headers.get("access-control-allow-credentials"),
      ).toBeNull();
    }
    const invalid = await t.fetch(SOURCE_CONTENT_PATH, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "DELETE" },
    });
    expect(invalid.status).toBe(403);
    const uploadRoute = `${SOURCE_UPLOAD_PATH}?title=Source&origin=Library`;
    const init = {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "text/plain" },
      body: "hello",
    };
    const deniedUpload = await t.fetch(uploadRoute, init);
    expect(deniedUpload.status).toBe(401);
    expect(deniedUpload.headers.get("access-control-allow-origin")).toBe("*");
    const uploaded = await owner.fetch(uploadRoute, init);
    expect(uploaded.status).toBe(201);
    expect(uploaded.headers.get("access-control-allow-origin")).toBe("*");
    const { sourceId } = (await uploaded.json()) as {
      sourceId: Id<"learnSources">;
    };
    const route = `${SOURCE_CONTENT_PATH}?sourceId=${sourceId}`;
    const allowed = await owner.fetch(route, { headers: { Origin: origin } });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("*");
    expect(allowed.headers.get("access-control-expose-headers")).toContain(
      "Content-Disposition",
    );
    await owner.mutation(remove, { sourceId });
    const revoked = await owner.fetch(route, { headers: { Origin: origin } });
    expect(revoked.status).toBe(404);
    expect(revoked.headers.get("access-control-allow-origin")).toBe("*");
  });
  it("app HTTP router mounts upload and the revocable authenticated content proxy", async () => {
    const t = createTestConvex(),
      owner = t.withIdentity(ownerIdentity);
    const uploaded = await owner.fetch(
      `${SOURCE_UPLOAD_PATH}?title=Image&origin=Library`,
      {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: pngBytes,
      },
    );
    expect(uploaded.status).toBe(201);
    const { sourceId } = (await uploaded.json()) as {
      sourceId: Id<"learnSources">;
    };
    const issued: string = await owner.query(content, { sourceId });
    const route = new URL(issued).pathname + new URL(issued).search;
    expect((await t.fetch(route)).status).toBe(404);
    expect((await owner.fetch(route)).status).toBe(200);
    await owner.mutation(remove, { sourceId });
    expect((await owner.fetch(route)).status).toBe(404);
  });
  it("contentProxy checks HTTP identity on every request and revokes an already issued route", async () => {
    const { t, sourceId } = await seeded(createProxyConvex());
    const owner = t.withIdentity(ownerIdentity),
      other = t.withIdentity(otherIdentity);
    await owner.mutation(update, { sourceId, contentVisibility: "restricted" });
    await owner.mutation(grant, {
      sourceId,
      userId: "other",
      metadata: false,
      content: true,
    });
    const issued: string = await other.query(content, { sourceId });
    const route = new URL(issued).pathname + new URL(issued).search;
    expect((await t.fetch(route)).status).toBe(404);
    const allowed = await other.fetch(route);
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toBe("hello");
    expect(allowed.headers.get("cache-control")).toBe("no-store, private");
    expect(allowed.headers.get("content-disposition")).toBe("attachment");
    expect(allowed.headers.get("location")).toBeNull();
    await owner.mutation(grant, {
      sourceId,
      userId: "other",
      metadata: false,
      content: false,
    });
    expect((await other.fetch(route)).status).toBe(404);
    expect(await other.query(content, { sourceId })).toBeNull();
    expect((await owner.fetch(route)).status).toBe(200);
  });
  it("owner updates visibility and metadata, retains citations and soft removes without deleting blobs", async () => {
    const { t, sourceId } = await seeded(createProxyConvex());
    const owner = t.withIdentity(ownerIdentity),
      other = t.withIdentity(otherIdentity);
    const route = `${SOURCE_CONTENT_PATH}?sourceId=${sourceId}`;
    for (const fn of [update, remove])
      await expect(other.mutation(fn, { sourceId })).rejects.toThrow(
        "unauthorized",
      );
    await expect(
      owner.mutation(update, {
        sourceId,
        metadata: { ...sourceMeta, kind: "file", title: "x".repeat(201) },
      }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(update, { sourceId, metadata: sourceMeta }),
    ).rejects.toThrow("kind");
    await expect(
      owner.mutation(update, {
        sourceId,
        metadata: { ...sourceMeta, kind: "file", origin: "Rewritten history" },
      }),
    ).rejects.toThrow("origin");
    await expect(
      owner.mutation(update, { sourceId, uploadedBy: "other" }),
    ).rejects.toThrow();
    await owner.mutation(update, {
      sourceId,
      metadata: { ...sourceMeta, kind: "file", title: "Revised" },
      metadataVisibility: "public",
      contentVisibility: "public",
    });
    expect((await t.query(metadata, { sourceId })).metadata.title).toBe(
      "Revised",
    );
    expect(
      await t.run((ctx) => ctx.db.get("learnSources", sourceId)),
    ).toMatchObject({
      metadata: { origin: "Library" },
      uploadedBy: "owner",
      sha256: "secret",
    });
    expect((await t.fetch(route)).status).toBe(200);
    await owner.mutation(update, { sourceId, contentVisibility: "private" });
    expect((await t.fetch(route)).status).toBe(404);
    await owner.mutation(remove, { sourceId, retain: true });
    expect(
      await t.run((ctx) => ctx.db.get("learnSources", sourceId)),
    ).toMatchObject({ status: "retained" });
    expect((await owner.fetch(route)).status).toBe(200);
    await owner.mutation(remove, { sourceId });
    expect((await owner.fetch(route)).status).toBe(404);
    expect(await owner.query(metadata, { sourceId })).toBeNull();
    await expect(
      owner.mutation(update, { sourceId, contentVisibility: "public" }),
    ).rejects.toThrow("unauthorized");
    const source = await t.run((ctx) => ctx.db.get("learnSources", sourceId));
    expect(source!.status).toBe("removed");
    expect(
      await t.run(
        async (ctx) =>
          (await ctx.storage.get(source!.storageId!))?.size ?? null,
      ),
    ).toBe(5);
  });
  it("HTTP proxy denies banned owners/readers, missing blobs and invalid source IDs", async () => {
    const { t, sourceId } = await seeded(createProxyConvex());
    const route = `${SOURCE_CONTENT_PATH}?sourceId=${sourceId}`;
    await t
      .withIdentity(ownerIdentity)
      .mutation(update, { sourceId, contentVisibility: "public" });
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "other",
        name: "Other",
        username: "other",
        email: "other@test.com",
        createdAt: 0,
        isBanned: true,
      }),
    );
    expect((await t.withIdentity(otherIdentity).fetch(route)).status).toBe(404);
    expect((await t.fetch(route)).status).toBe(200);
    await t.run((ctx) => ctx.db.patch("users", userId, { clerkId: "owner" }));
    expect((await t.fetch(route)).status).toBe(404);
    await t.run(async (ctx) => {
      await ctx.db.delete("users", userId);
      const source = await ctx.db.get("learnSources", sourceId);
      await ctx.storage.delete(source!.storageId!);
    });
    expect((await t.fetch(route)).status).toBe(404);
    expect(await t.query(content, { sourceId })).toBeNull();
    expect((await t.fetch(SOURCE_CONTENT_PATH)).status).toBe(404);
    expect(
      (await t.fetch(`${SOURCE_CONTENT_PATH}?sourceId=invalid`)).status,
    ).toBe(404);
  });
  it("redacts storage/hash and refuses private content even with public metadata", async () => {
    const { t, sourceId } = await seeded();
    for (const caller of [
      t,
      t.withIdentity(otherIdentity),
      t.withIdentity(ownerIdentity),
    ]) {
      const result = await caller.query(metadata, { sourceId });
      expect(Object.keys(result).sort()).toEqual(
        [
          "_id",
          "metadata",
          "metadataVisibility",
          "contentVisibility",
          "createdAt",
          "provenance",
        ].sort(),
      );
    }
    expect(await t.query(content, { sourceId })).toBeNull();
    expect(
      await t.withIdentity(otherIdentity).query(content, { sourceId }),
    ).toBeNull();
    expect(
      await t.withIdentity(ownerIdentity).query(content, { sourceId }),
    ).toBe(
      `https://test.convex.site/learn/sources/content?sourceId=${encodeURIComponent(sourceId)}`,
    );
  });
  it("owner-only grants independently permit metadata or content and can be revoked", async () => {
    const { t, sourceId } = await seeded();
    await t.run((ctx) =>
      ctx.db.patch("learnSources", sourceId, {
        metadataVisibility: "restricted",
        contentVisibility: "restricted",
      }),
    );
    const other = t.withIdentity(otherIdentity),
      owner = t.withIdentity(ownerIdentity);
    await expect(
      other.mutation(grant, {
        sourceId,
        userId: "other",
        metadata: true,
        content: true,
      }),
    ).rejects.toThrow("unauthorized");
    await owner.mutation(grant, {
      sourceId,
      userId: "other",
      metadata: true,
      content: false,
    });
    expect(await other.query(metadata, { sourceId })).not.toBeNull();
    expect(await other.query(content, { sourceId })).toBeNull();
    await owner.mutation(grant, {
      sourceId,
      userId: "other",
      metadata: false,
      content: true,
    });
    expect(await other.query(metadata, { sourceId })).toBeNull();
    expect(await other.query(content, { sourceId })).not.toBeNull();
    await owner.mutation(grant, {
      sourceId,
      userId: "other",
      metadata: false,
      content: false,
    });
    expect(await other.query(content, { sourceId })).toBeNull();
  });
  it("rejects missing/removed sources, banned owners and banned readers", async () => {
    const { t, sourceId } = await seeded();
    await t.run((ctx) =>
      ctx.db.patch("learnSources", sourceId, {
        contentVisibility: "public",
        status: "removed",
      }),
    );
    for (const fn of [metadata, content])
      expect(
        await t.withIdentity(ownerIdentity).query(fn, { sourceId }),
      ).toBeNull();
    await t.run((ctx) =>
      ctx.db.patch("learnSources", sourceId, { status: "active" }),
    );
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "other",
        name: "Other",
        username: "other",
        email: "other@test.com",
        createdAt: 0,
        isBanned: true,
      }),
    );
    for (const fn of [metadata, content])
      expect(
        await t.withIdentity(otherIdentity).query(fn, { sourceId }),
      ).toBeNull();
    await t.run((ctx) => ctx.db.patch("users", userId, { clerkId: "owner" }));
    for (const fn of [metadata, content])
      expect(await t.query(fn, { sourceId })).toBeNull();
    await t.run((ctx) => ctx.db.delete("learnSources", sourceId));
    for (const fn of [metadata, content])
      expect(await t.query(fn, { sourceId })).toBeNull();
  });
  it("validates metadata and never accepts client storage registration", async () => {
    const t = createTestConvex(),
      owner = t.withIdentity(ownerIdentity);
    const args = {
      metadata: sourceMeta,
      metadataVisibility: "private",
      contentVisibility: "private",
    };
    await expect(t.mutation(create, args)).rejects.toThrow("authenticated");
    for (const invalid of [
      { title: "x".repeat(201) },
      { origin: "x".repeat(501) },
      { kind: "url", url: "http://example.com" },
      { kind: "url", url: "https://user:pass@example.com" },
      { kind: "url", url: "javascript:alert(1)" },
      { kind: "file" },
    ]) {
      await expect(
        owner.mutation(create, {
          ...args,
          metadata: { ...sourceMeta, ...invalid },
        }),
      ).rejects.toThrow();
    }
    const sourceId = await owner.mutation(create, args);
    expect(
      await t.run((ctx) => ctx.db.get("learnSources", sourceId)),
    ).toMatchObject({ ownerId: "owner", uploadedBy: "owner" });
    await expect(
      owner.mutation(create, { ...args, storageId: "stolen" }),
    ).rejects.toThrow();
  });
  it("uploads authenticated blobs, detects private owner duplicates and cleans rejected files", async () => {
    const t = createTestConvex(),
      owner = t.withIdentity(ownerIdentity);
    expect(
      (await t.action((ctx) => serialResponse(ctx, request()))).status,
    ).toBe(401);
    const first = await owner.action((ctx) => serialResponse(ctx, request()));
    expect(first.status).toBe(201);
    const firstResult = JSON.parse(first.body) as {
      sourceId: Id<"learnSources">;
      duplicate: boolean;
    };
    const second = await owner.action((ctx) => serialResponse(ctx, request()));
    expect(JSON.parse(second.body)).toEqual({
      ...firstResult,
      duplicate: true,
    });
    expect(
      await t.run((ctx) => ctx.db.system.query("_storage").collect()),
    ).toHaveLength(1);
    const otherResult = await t
      .withIdentity(otherIdentity)
      .action((ctx) => serialResponse(ctx, request()));
    expect(JSON.parse(otherResult.body).duplicate).toBe(false);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "owner",
        name: "Owner",
        username: "owner",
        email: "owner@test.com",
        createdAt: 0,
        isBanned: true,
      }),
    );
    expect(
      (await owner.action((ctx) => serialResponse(ctx, request("new")))).status,
    ).toBe(400);
    expect(
      await t.run((ctx) => ctx.db.system.query("_storage").collect()),
    ).toHaveLength(2);
    expect(
      (
        await owner.action((ctx) =>
          serialResponse(ctx, request("", "text/html")),
        )
      ).status,
    ).toBe(415);
    expect(
      (await owner.action((ctx) => serialResponse(ctx, request("")))).status,
    ).toBe(400);
    expect(
      (
        await owner.action((ctx) =>
          serialResponse(ctx, request("x".repeat(25 * 1024 * 1024 + 1))),
        )
      ).status,
    ).toBe(413);
  });
  it("internal registration verifies system metadata, not supplied hashes", async () => {
    const t = createTestConvex(),
      owner = t.withIdentity(ownerIdentity);
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["hello"], { type: "text/plain" })),
    );
    await expect(
      owner.mutation(register, {
        storageId,
        contentType: "text/plain",
        metadata: { ...sourceMeta, kind: "pdf" },
        metadataVisibility: "private",
        contentVisibility: "private",
      }),
    ).rejects.toThrow("Invalid source file");
  });
  it.each(signatureFixtures)(
    "checks $mime magic before storing the upload",
    async ({ mime, bytes }) => {
      const t = createProxyConvex(),
        owner = t.withIdentity(ownerIdentity);
      const uploadRoute = `${SOURCE_UPLOAD_PATH}?title=Source&origin=Library`;
      const spoof = await owner.fetch(uploadRoute, {
        method: "POST",
        headers: { "Content-Type": mime },
        body: "spoofed file",
      });
      expect(spoof.status).toBe(415);
      expect(
        await t.run((ctx) => ctx.db.system.query("_storage").collect()),
      ).toHaveLength(0);
      const accepted = await owner.fetch(uploadRoute, {
        method: "POST",
        headers: { "Content-Type": mime },
        body: bytes,
      });
      expect(accepted.status).toBe(201);
      const { sourceId } = (await accepted.json()) as {
        sourceId: Id<"learnSources">;
      };
      expect(await t.query(metadata, { sourceId })).toBeNull();
      expect(
        await t.run((ctx) => ctx.db.get("learnSources", sourceId)),
      ).toMatchObject({
        metadataVisibility: "private",
        contentVisibility: "private",
        uploadedBy: "owner",
      });
      const route = `${SOURCE_CONTENT_PATH}?sourceId=${sourceId}`;
      expect((await t.fetch(route)).status).toBe(404);
      await owner.mutation(update, { sourceId, metadataVisibility: "public" });
      expect(await t.query(metadata, { sourceId })).not.toBeNull();
      expect((await t.fetch(route)).status).toBe(404);
      const downloaded = await owner.fetch(route);
      expect(downloaded.status).toBe(200);
      expect(downloaded.headers.get("content-type")).toBe(mime);
      expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(bytes);
    },
  );
  it("rejects plain ZIPs, truncated signatures and binary data labeled text", async () => {
    const t = createProxyConvex(),
      owner = t.withIdentity(ownerIdentity);
    const route = `${SOURCE_UPLOAD_PATH}?title=Source&origin=Library`;
    for (const [mime, bytes] of [
      [pptxMime, zipFixture(["unrelated.txt"])],
      [pptxMime, new Uint8Array([80, 75, 3, 4])],
      ["image/png", new Uint8Array([137, 80, 78])],
      ["image/jpeg", pngBytes],
      ["text/plain", pngBytes],
    ] as const) {
      expect(
        (
          await owner.fetch(route, {
            method: "POST",
            headers: { "Content-Type": mime },
            body: bytes,
          })
        ).status,
      ).toBe(415);
    }
    expect(
      await t.run((ctx) => ctx.db.system.query("_storage").collect()),
    ).toHaveLength(0);
  });
  it("never deduplicates to retained, removed or shared source records", async () => {
    const t = createProxyConvex(),
      owner = t.withIdentity(ownerIdentity);
    const route = `${SOURCE_UPLOAD_PATH}?title=Source&origin=Library`;
    const send = async () =>
      (await (
        await owner.fetch(route, {
          method: "POST",
          headers: { "Content-Type": "image/png" },
          body: pngBytes,
        })
      ).json()) as { sourceId: Id<"learnSources">; duplicate: boolean };
    const first = await send();
    await owner.mutation(remove, { sourceId: first.sourceId, retain: true });
    const second = await send();
    expect(second).toMatchObject({ duplicate: false });
    expect(second.sourceId).not.toBe(first.sourceId);
    await owner.mutation(remove, { sourceId: second.sourceId });
    const third = await send();
    expect(third.duplicate).toBe(false);
    await owner.mutation(update, {
      sourceId: third.sourceId,
      metadataVisibility: "public",
    });
    const fourth = await send();
    expect(fourth.duplicate).toBe(false);
    expect(fourth.sourceId).not.toBe(third.sourceId);
    expect(
      await t.run((ctx) => ctx.db.system.query("_storage").collect()),
    ).toHaveLength(4);
  });
});
