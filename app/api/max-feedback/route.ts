import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { MAX_ORIGIN, parseMaxFeedback } from "@/lib/maxFeedback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const SHARE_ID = "y4h9v9c43d";
const CORS = {
  "Access-Control-Allow-Origin": MAX_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin",
  "Cache-Control": "no-store",
};
const reply = (body: object, status: number) => Response.json(body, { status, headers: CORS });
export function OPTIONS(request: Request) {
  return request.headers.get("origin") === MAX_ORIGIN ? new Response(null, { status: 204, headers: CORS }) : reply({ error: "Origin not allowed" }, 403);
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== MAX_ORIGIN) return reply({ error: "Origin not allowed" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "Invalid report" }, 415);
  const body = await request.text().catch(() => "");
  const input = parseMaxFeedback(body);
  if (!input) return reply({ error: "Check your report and try again." }, 422);
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return reply({ error: "Reporting is temporarily unavailable." }, 503);
  try {
    const convex = new ConvexHttpClient(url);
    const form = await convex.query(api.respond.getPublicForm, { shareId: SHARE_ID });
    if (form.state !== "open") return reply({ error: "Reporting is temporarily unavailable." }, 503);
    // Use pinned field IDs, never client-supplied destinations. Resolve choices from the live definition.
    const kind = form.definition.fields.find(f => f.id === "qb89e8cad1a" && f.type === "choice");
    const message = form.definition.fields.find(f => f.id === "qff64dd6583" && f.type === "textarea");
    const area = form.definition.fields.find(f => f.id === "q4e9d6d55ea");
    const version = form.definition.fields.find(f => f.id === "qbc34d35e5d");
    const option = kind?.options?.find(o => o.label === input.kind);
    if (!kind || !option || !message || !area || !version) return reply({ error: "Reporting configuration unavailable." }, 503);
    const result = await convex.mutation(api.respond.submitResponse, {
      shareId: SHARE_ID, submissionKey: input.submissionKey, language: "en", final: true,
      answers: { [kind.id]: option.id, [message.id]: input.message, [area.id]: input.area, [version.id]: input.version },
    });
    return reply({ ok: true, receipt: result.receiptCode }, 200);
  } catch {
    // Do not log report contents, credentials or backend details.
    return reply({ error: "Could not send your report. Please try again." }, 503);
  }
}
