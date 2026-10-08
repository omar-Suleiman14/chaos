/** Navigation protection; Convex independently verifies authentication and ownership for every data operation. */
const protectedRoots = ["/dashboard", "/admin", "/print", "/homework", "/auth"];

export function isProtectedPath(pathname: string): boolean {
  const path = pathname.replace(/^\/(?:en|ar)(?=\/|$)/, "") || "/";
  return protectedRoots.some(root => path === root || path.startsWith(`${root}/`));
}
