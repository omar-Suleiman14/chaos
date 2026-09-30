// OpenAI plugin domain verification. Set OPENAI_APPS_CHALLENGE_TOKEN to the token
// shown in the OpenAI Platform submission form (MCP tab → Domain verification).
export const dynamic = "force-dynamic";

export function GET() {
  const token = process.env.OPENAI_APPS_CHALLENGE_TOKEN?.trim();
  if (!token) return new Response("Not found", { status: 404 });
  return new Response(token, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
