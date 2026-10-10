import { describe, expect, it } from "vitest";
import { uiMeta } from "../../lib/learn/lessonRows";
import type { Doc } from "../../convex/_generated/dataModel";

describe("durable lesson metadata mapping", () => {
  it("uses noindex for legacy records without a policy", () => {
    expect(uiMeta({ title: "Synthetic" } as unknown as Doc<"lessons">["metadata"])).toMatchObject({ indexing: "noindex", curricula: [] });
  });
  it("keeps an explicit index policy", () => {
    expect(uiMeta({ indexing: "index" } as unknown as Doc<"lessons">["metadata"]).indexing).toBe("index");
  });
});
