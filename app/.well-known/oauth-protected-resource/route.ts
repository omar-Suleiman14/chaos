import { metadataCors, protectedResourceResponse } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return protectedResourceResponse(request);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: metadataCors });
}
