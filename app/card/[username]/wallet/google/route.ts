import { googleSaveUrl } from "@/lib/wallet";
import { publicCard } from "../../lookup";

/** Redirects to Google's "Save to Google Wallet" page with a signed pass for the public card. */
export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const card = await publicCard((await params).username);
  if (!card) return new Response("Not found", { status: 404 });
  const url = googleSaveUrl(card);
  if (!url) return new Response("Google Wallet isn't set up on this Chaos installation.", { status: 404 });
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store" } });
}
