import { betterAuthServer } from "@/lib/auth/server";
function handler(request: Request) {
  if (process.env.NEXT_PUBLIC_AUTH_PROVIDER !== "betterauth")
    return new Response(null, { status: 404 });
  return betterAuthServer().handler[request.method === "GET" ? "GET" : "POST"](
    request,
  );
}
export { handler as GET, handler as POST };
