import { applePass } from "@/lib/wallet";
import { publicCard } from "../../lookup";

/** The public card as a signed Apple Wallet pass. Same privacy-filtered data as /card/<username>. */
export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const card = await publicCard((await params).username);
  if (!card) return new Response("Not found", { status: 404 });
  const pass = await applePass(card);
  if (!pass) return new Response("Apple Wallet isn't set up on this Chaos installation.", { status: 404 });
  return new Response(new Uint8Array(pass), {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="chaos-card-${card.username}.pkpass"`,
      "Cache-Control": "private, no-store",
    },
  });
}
