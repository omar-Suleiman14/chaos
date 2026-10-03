import { auth } from "@/lib/auth/server";
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.id || session.authError) return Response.redirect(new URL("/api/auth/signin", request.url));
  const issuer = process.env.AUTH_OIDC_ISSUER?.trim().replace(/\/+$/, "");
  if (!issuer) return new Response("Account management unavailable", { status: 503 });
  const url = new URL(`${issuer}/account`);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return new Response("Account management unavailable", { status: 503 });
  return Response.redirect(url);
}
