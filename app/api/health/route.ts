import packageInfo from "../../../package.json";

// Liveness probe for containers and load balancers. Deliberately touches no
// backend and returns nothing sensitive.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", version: packageInfo.version }, { headers: { "Cache-Control": "no-store" } });
}
