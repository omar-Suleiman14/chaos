import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const app = join(process.cwd(), "app");
/** Directories whose children are top-level URL segments: app/, the language segment and its route groups. */
export const routeRoots = [app, join(app, "[lang]"), join(app, "[lang]", "(site)"), join(app, "[lang]", "(app)")];

/** First URL segments served by app/, e.g. "pricing", "dashboard", "[username]". */
export function topLevelRouteFolders(): string[] {
  return [...new Set(routeRoots.flatMap((root) => readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "[lang]" && !d.name.startsWith("("))
    .map((d) => d.name)))];
}

/** True when a URL path such as "/learn/courses" has a folder under any route root. */
export function routeFolderExists(parts: string[]): boolean {
  return routeRoots.some((root) => existsSync(join(root, ...parts)));
}
