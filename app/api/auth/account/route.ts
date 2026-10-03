export function GET(request: Request) {
  return Response.redirect(new URL("/auth/account", request.url));
}
