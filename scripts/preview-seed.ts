// Seeds a Vercel preview's own Convex preview deployment with a small, known workspace and
// writes direct links to public/preview/links.json (and the build log).
//
// Runs inside `convex deploy --cmd` on preview builds (scripts/vercel-build.mjs), so
// NEXT_PUBLIC_CONVEX_URL points at the branch's preview backend, never production.
// Content goes through the real MCP server and the Convex MCP backend, the same path
// ChatGPT uses, as the account PREVIEW_OWNER_ID.
//
// Idempotent per branch: the previous deployment's links.json is reused while its
// content still exists, so pushing again does not pile up copies.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpToolError, type McpCaller } from "../lib/mcp/server";
import { connect, seed, tool, type PreviewLinks } from "./lib/previewSeed";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
const site = (process.env.CONVEX_SITE_URL ?? convexUrl.replace(/\.convex\.cloud\/?$/, ".convex.site")).replace(/\/+$/, "");
const secret = process.env.CHAOS_MCP_SECRET;
const owner = process.env.PREVIEW_OWNER_ID ?? "user_previewowner";
const branchUrl = process.env.VERCEL_BRANCH_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

const caller: McpCaller = async (name, input) => {
  const response = await fetch(`${site}/api/mcp/v1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ userId: owner, profile: { name: "Preview Owner", email: "preview-owner@chaos.invalid" }, tool: name, input }),
  });
  const body = (await response.json().catch(() => null)) as { result?: unknown; error?: { code: string; message: string; details?: unknown } } | null;
  if (response.ok && body && "result" in body) return body.result;
  throw new McpToolError(body?.error?.code ?? "ERROR", body?.error?.message ?? `HTTP ${response.status}`, body?.error?.details);
};

/** The previous deployment of this branch, if its content is still there. */
async function previous(client: Client): Promise<PreviewLinks | null> {
  if (!branchUrl) return null;
  try {
    const response = await fetch(`https://${branchUrl}/preview/links.json`, { headers: bypass ? { "x-vercel-protection-bypass": bypass } : {} });
    if (!response.ok) return null;
    const links = (await response.json()) as PreviewLinks;
    await tool(client, "get_form", { id: links.ids.formId });
    await tool(client, "get_lesson", { lessonId: links.ids.lessonId, view: "outline" });
    return links;
  } catch {
    return null;
  }
}

async function main() {
  if (!secret || !site) {
    console.warn("preview-seed: CHAOS_MCP_SECRET or the Convex URL is missing; the preview has no seeded workspace.");
    return;
  }
  const client = await connect(caller);
  const links = (await previous(client)) ?? (await seed(client, owner));
  await client.close();
  mkdirSync(join("public", "preview"), { recursive: true });
  writeFileSync(join("public", "preview", "links.json"), JSON.stringify(links, null, 2) + "\n");
  console.log(`preview-seed: workspace from ${links.seededAt}`);
  for (const link of links.links) console.log(`  ${link.label}: ${link.path}`);
}

// A failed seed must not fail the preview build; the workspace is a convenience.
main().catch((error) => console.warn("preview-seed failed:", error instanceof Error ? error.message : error));
