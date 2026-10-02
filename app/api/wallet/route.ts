import { walletAvailability } from "@/lib/wallet";

/** Which wallet buttons to show. Only booleans: no issuer details leave the server. */
export function GET() {
  return Response.json(walletAvailability(), { headers: { "Cache-Control": "public, max-age=300" } });
}
