import { describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { ConvexReactClient } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { assessmentEditorHref, effectiveClaimStatus, StudyClient } from "@/lib/learn/studyClient";

function fixture() {
  const query = vi.fn(); const mutation = vi.fn();
  const client = new StudyClient({ query, mutation } as unknown as Pick<ConvexReactClient, "query" | "mutation">);
  return { client, query, mutation };
}
describe("durable study client", () => {
  it("forks an immutable form publication and returns the NEW draft builder route", async () => {
    const { client, query, mutation } = fixture();
    query.mockResolvedValue({ formVersionId: "publication" }); mutation.mockResolvedValue({ asset: { kind: "form", id: "new-draft" } });
    expect(await client.forkAssessment({ kind: "form", id: "original" as Id<"forms"> })).toEqual({ asset: { kind: "form", id: "new-draft" }, href: "/dashboard/forms/new-draft" });
    expect(getFunctionName(mutation.mock.calls[0][0])).toBe("quizForks:fork");
    expect(mutation.mock.calls[0][1]).toEqual({ asset: { kind: "form", id: "original" }, formVersionId: "publication" });
  });
  it("links a copied assessment to its form builder with an encoded id", () => {
    expect(assessmentEditorHref({ kind: "form", id: "a&b" as Id<"forms"> })).toBe("/dashboard/forms/a%26b");
  });
  it("refuses missing publications without creating a draft", async () => {
    const { client, query, mutation } = fixture(); query.mockResolvedValue(null);
    await expect(client.forkQuiz("missing")).rejects.toThrow("published version"); expect(mutation).not.toHaveBeenCalled();
  });
  it("sends only minimal affiliation text and waits for backend rejection", async () => {
    const { client, mutation } = fixture(); mutation.mockResolvedValue("claim");
    expect(await client.claimIdentity("student", "  University  ")).toBe("claim");
    expect(getFunctionName(mutation.mock.calls[0][0])).toBe("learnCommunity:claimIdentity");
    expect(mutation.mock.calls[0][1]).toEqual({ role: "student", institution: "University" });
    mutation.mockRejectedValue(new Error("Existing claim differs")); await expect(client.claimIdentity("student", "Other")).rejects.toThrow("differs");
    expect(() => client.claimIdentity("student", " ")).toThrow("institution");
  });
  it("requires reviewed unexpired identity claims; pending never implies verification", () => {
    const reviewed = { status: "verified", method: "manual_review", reviewedBy: "reviewer", expiresAt: 200 };
    expect(effectiveClaimStatus(reviewed, 199)).toBe("verified"); expect(effectiveClaimStatus(reviewed, 200)).toBe("expired");
    expect(effectiveClaimStatus({ status: "verified" }, 100)).toBe("expired");
    expect(effectiveClaimStatus({ status: "verified", expiresAt: 200 }, 100)).toBe("pending");
    expect(effectiveClaimStatus({ status: "pending" })).toBe("pending"); expect(effectiveClaimStatus({ status: "revoked" })).toBe("rejected");
  });
});
