"use client";

import { useEffect, useMemo, useState } from "react";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type * as reads from "@/convex/learnStudyReads";
type ReadApi = ApiFromModules<{ learnStudyReads: typeof reads }>["learnStudyReads"];

// Typed references keep this independent of another agent's generated API edits.
export const studyReads = {
  forkSource: makeFunctionReference<"query", FunctionArgs<ReadApi["forkSource"]>, FunctionReturnType<ReadApi["forkSource"]>>("learnStudyReads:forkSource"),
  myConcepts: makeFunctionReference<"query", FunctionArgs<ReadApi["myConcepts"]>, FunctionReturnType<ReadApi["myConcepts"]>>("learnStudyReads:myConcepts"),
  practiceLink: makeFunctionReference<"query", FunctionArgs<ReadApi["practiceLink"]>, FunctionReturnType<ReadApi["practiceLink"]>>("learnStudyReads:practiceLink"),
  saveFormAttachments: makeFunctionReference<"mutation", FunctionArgs<ReadApi["saveFormAttachments"]>, FunctionReturnType<ReadApi["saveFormAttachments"]>>("learnStudyReads:saveFormAttachments"),
  weakAreas: makeFunctionReference<"query", FunctionArgs<ReadApi["weakAreas"]>, FunctionReturnType<ReadApi["weakAreas"]>>("learnStudyReads:weakAreas"),
  publicIdentity: makeFunctionReference<"query", FunctionArgs<ReadApi["publicIdentity"]>, FunctionReturnType<ReadApi["publicIdentity"]>>("learnStudyReads:publicIdentity"),
};
type Client = Pick<ConvexReactClient, "query" | "mutation">;
export function useStudyCapabilities() {
  const auth = useConvexAuth();
  return { quizForks: auth.isAuthenticated, verification: auth.isAuthenticated, weakAreas: auth.isAuthenticated };
}
export class StudyClient {
  constructor(private client: Client) {}
  async forkAssessment(asset: FunctionArgs<typeof api.quizForks.fork>["asset"]) {
    const source = await this.client.query(studyReads.forkSource, { asset });
    if (!source) throw new Error("This quiz has no accessible published version to copy.");
    const result = await this.client.mutation(api.quizForks.fork, { asset, ...source });
    return { ...result, href: assessmentEditorHref(result.asset) };
  }
  async forkQuiz(formId: string): Promise<string> {
    const asset = { kind: "form" as const, id: formId as Id<"forms"> };
    const result = await this.forkAssessment(asset);
    if (result.asset.kind !== "form") throw new Error("Unexpected copied assessment type.");
    return result.asset.id;
  }
  claimIdentity(role: "student" | "educator", institution: string) {
    const value = institution.trim();
    if (!value || value.length > 200) throw new Error("Enter an institution name of 1–200 characters.");
    return this.client.mutation(api.learnCommunity.claimIdentity, { role, institution: value });
  }
}
export function assessmentEditorHref(asset: FunctionArgs<typeof api.quizForks.fork>["asset"]) {
  return asset.kind === "form" ? `/dashboard/forms/${encodeURIComponent(asset.id)}` : `/dashboard/editor?id=${encodeURIComponent(asset.id)}`;
}
export function useStudyActions() {
  const client = useConvex();
  return useMemo(() => new StudyClient(client), [client]);
}
export function useIdentityClaims() {
  const auth = useConvexAuth();
  const claims = useQuery(api.learnCommunity.getMyClaims, auth.isAuthenticated ? {} : "skip");
  useExpiryClock(claims);
  return claims;
}
function useExpiryClock(roles: { expiresAt?: number }[] | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const expiresAt = Math.min(...(roles ?? []).flatMap(role => role.expiresAt !== undefined && role.expiresAt > Date.now() ? [role.expiresAt] : []));
    if (!Number.isFinite(expiresAt)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2_147_483_647, Math.max(0, expiresAt - Date.now() + 1)));
    return () => clearTimeout(timer);
  }, [roles, now]);
  return now;
}
export function usePublicIdentity(username?: string) {
  const roles = useQuery(studyReads.publicIdentity, username ? { username } : "skip");
  const now = useExpiryClock(roles);
  return (roles ?? []).filter(role => role.expiresAt > now).map(role => ({ kind: role.kind, status: "verified" as const }));
}
export function useStudyEvidence(conceptIds: Id<"learnConcepts">[]) {
  const auth = useConvexAuth();
  const [now, setNow] = useState(() => Date.now());
  const ids = [...new Set(conceptIds)].slice(0, 10);
  const args = auth.isAuthenticated && ids.length ? { conceptIds: ids, now } : "skip";
  const states = useQuery(api.learnPractice.conceptStates, args);
  const practice = useQuery(api.learnPractice.selectPractice, args);
  return { states, practice, refresh: () => setNow(Date.now()) };
}
export function effectiveClaimStatus(claim: { status: string; expiresAt?: number; method?: string; reviewedBy?: string }, now = Date.now()) {
  if (claim.status === "verified") {
    if (claim.expiresAt === undefined || claim.expiresAt <= now) return "expired";
    if (claim.method !== "manual_review" || !claim.reviewedBy) return "pending";
  }
  return claim.status === "revoked" ? "rejected" : claim.status;
}
