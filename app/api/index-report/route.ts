import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INDEX_ORIGIN = "https://index.chaos.fail";
const REPORT_SHARE_ID = "ubkfqijk2w";

// Keep the index's canonical module order; a report may never claim a different year.
const MODULES = [
  [1, "General Anatomy & Histology"], [1, "General Physiology & Biochemistry"],
  [1, "General Microbiology & Parasitology"], [1, "General Pathology & Pharmacology"],
  [1, "Locomotor System"], [1, "GIT & Nutrition"],
  [2, "Blood"], [2, "Cardiovascular System"], [2, "Respiratory System"],
  [2, "Basic Clinical Skills"], [2, "Endocrine System"], [2, "PMP"],
  [2, "Reproductive System"], [2, "Renal System"], [2, "ERMS"],
  [3, "Central Nervous System"], [3, "Head, Neck & Special Senses"],
  [3, "Community Medicine"],
] as const;

const ALLOWED_TYPES = new Set(["Lecture", "Tutorial", "CBL", "Practical", "Questions", "Other"]);
const CORS = {
  "Access-Control-Allow-Origin": INDEX_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin",
  "Cache-Control": "no-store",
};

function reply(body: Record<string, string | boolean>, status: number): Response {
  return Response.json(body, { status, headers: CORS });
}

export function OPTIONS(request: Request): Response {
  if (request.headers.get("origin") !== INDEX_ORIGIN) return reply({ error: "Origin not allowed" }, 403);
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("origin") !== INDEX_ORIGIN) return reply({ error: "Origin not allowed" }, 403);

  const bodyText = await request.text().catch(() => "");
  if (!bodyText || bodyText.length > 5_000) return reply({ error: "Invalid report" }, 400);

  let input: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Not an object");
    input = parsed as Record<string, unknown>;
  } catch {
    return reply({ error: "Invalid report" }, 400);
  }

  // An invisible honeypot; the report UI does not have an email/signup requirement.
  if (typeof input.website === "string" && input.website.trim()) return reply({ ok: true }, 200);

  const year = input.year;
  const moduleIndex = input.moduleIndex;
  const type = input.type;
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const submissionKey = input.submissionKey;
  const startedAt = input.startedAt;
  const entry = typeof moduleIndex === "number" && Number.isInteger(moduleIndex) ? MODULES[moduleIndex] : null;
  if (!entry || year !== entry[0] || typeof type !== "string" || !ALLOWED_TYPES.has(type)
      || notes.length < 6 || notes.length > 1_500
      || typeof submissionKey !== "string" || !/^[A-Za-z0-9-]{8,100}$/.test(submissionKey)
      || typeof startedAt !== "number" || !Number.isFinite(startedAt)
      || startedAt > Date.now() + 10_000 || startedAt < Date.now() - 24 * 60 * 60 * 1000) {
    return reply({ error: "Check the year, module, type and notes." }, 422);
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return reply({ error: "Reporting is temporarily unavailable." }, 503);

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const form = await convex.query(api.respond.getPublicForm, { shareId: REPORT_SHARE_ID });
    if (form.state !== "open") return reply({ error: "Reporting is temporarily unavailable." }, 503);

    const notesField = form.definition.fields.find((field) => field.type === "textarea" && field.required);
    if (!notesField) return reply({ error: "Reporting configuration is unavailable." }, 503);

    const result = await convex.mutation(api.respond.submitResponse, {
      shareId: REPORT_SHARE_ID,
      submissionKey,
      answers: { [notesField.id]: notes },
      language: "en",
      final: true,
      startedAt,
      hidden: {
        index_year: String(year),
        index_module: entry[1],
        index_type: type,
        index_source: "index.chaos.fail",
      },
    });

    return reply({ ok: true, receipt: result.receiptCode }, 200);
  } catch (error) {
    // Do not expose Convex details or account-specific backend information publicly.
    console.error("Chaos Index report submission failed:", error instanceof Error ? error.message : "unknown");
    return reply({ error: "Could not send your report. Please try again." }, 503);
  }
}
