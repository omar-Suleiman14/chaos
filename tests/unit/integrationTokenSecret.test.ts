import { describe, expect, it } from "vitest";
import { newSecret } from "../../convex/integrationTokenSecret";

describe("integration token secret", () => {
  it("generates a correctly formatted token and its non-secret display hint", () => {
    const { token, hint } = newSecret();
    expect(token).toMatch(/^chaos_[a-f0-9]{64}$/);
    expect(hint).toBe(token.slice(0, 12) + "…");
  });
  it("does not reuse a generated secret", () => {
    expect(newSecret().token).not.toBe(newSecret().token);
  });
});
