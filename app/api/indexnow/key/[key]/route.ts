import { indexNowKeyValid } from "@/convex/indexNowModel";

/**
 * The IndexNow key file, served at /<INDEXNOW_KEY>.txt through the rewrite in next.config.ts.
 * Search engines fetch it to confirm that submissions for this host come from its owner.
 * Any other name is a 404, so the route cannot be used to probe for the key.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const configured = process.env.INDEXNOW_KEY?.trim();
  if (!indexNowKeyValid(configured) || key !== configured) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(configured, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "noindex" },
  });
}
