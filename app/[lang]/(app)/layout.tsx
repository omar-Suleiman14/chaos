import { connection } from "next/server";

/**
 * Signed-in areas, public forms and Learn readers. They render per request, as they always have:
 * their language follows the chaos-lang cookie (proxy.ts picks the /en or /ar segment), and their
 * data is live. Marketing pages in (site) are static instead.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return children;
}
