import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Access-Control-Allow-Origin": "https://index.chaos.fail",
  "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60",
  "Vary": "Origin",
};

export async function GET(request: Request): Promise<Response> {
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  if (cursor && cursor.length > 1000) return Response.json({ error: "Invalid cursor" }, { status: 400, headers });
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return Response.json({ error: "Index catalogue unavailable" }, { status: 503, headers });
  try {
    const client = new ConvexHttpClient(convexUrl);
    const result = await client.query(api.indexCatalog.list, { cursor });
    return Response.json(result, { headers });
  } catch {
    return Response.json({ error: "Index catalogue unavailable" }, { status: 503, headers: { ...headers, "Cache-Control": "no-store" } });
  }
}
