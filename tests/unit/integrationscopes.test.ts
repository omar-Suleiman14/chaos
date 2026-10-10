import { describe, expect, it } from "vitest";
import { validScopes } from "@/convex/integrationScopeValidation";
describe("integration connection scopes", () => {
  it("deduplicates and orders scopes by canonical registry", () => {
    expect(validScopes(["drafts:create", "items:read", "drafts:create", "lessons:read"])).toEqual(["items:read", "drafts:create", "lessons:read"]);
  });
  it("keeps empty-scope error", () => {
    expect(() => validScopes([])).toThrow("INVALID_SCOPES: Choose at least one permission.");
  });
  it("retains a single valid permission", () => {
    expect(validScopes(["webhooks:manage"])).toEqual(["webhooks:manage"]);
  });
});
