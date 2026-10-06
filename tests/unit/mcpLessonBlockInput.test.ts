import { describe, expect, it } from "vitest";
import { z } from "zod";
import { learnBlockInput, learnBlockSchema, lessonDocumentInput } from "@/lib/mcp/learn";

const paragraph = { id: "p1", type: "paragraph", text: "Hello", citations: [], conceptIds: [] };

describe("MCP lesson block input", () => {
  it("parses to exactly what the full block union produces", () => {
    const heading = { id: "h1", type: "heading", level: 2, text: "Title", citations: [], conceptIds: [], tone: "info" };
    expect(learnBlockInput.parse(heading)).toEqual(learnBlockSchema.parse(heading));
    expect(learnBlockInput.parse(heading)).not.toHaveProperty("tone");
    expect(lessonDocumentInput.parse({ schemaVersion: 1, blocks: [paragraph] }).blocks[0]).toEqual(learnBlockSchema.parse(paragraph));
  });

  it("rejects blocks the full union rejects", () => {
    expect(learnBlockInput.safeParse({ ...paragraph, type: "heading", level: 4 }).success).toBe(false);
    expect(learnBlockInput.safeParse({ ...paragraph, type: "callout" }).success).toBe(false);
    expect(learnBlockInput.safeParse({ ...paragraph, type: "video" }).success).toBe(false);
  });

  it("keeps the advertised schema small", () => {
    const size = JSON.stringify(z.toJSONSchema(learnBlockInput, { io: "input" })).length;
    expect(size).toBeLessThan(JSON.stringify(z.toJSONSchema(learnBlockSchema)).length / 4);
  });
});
