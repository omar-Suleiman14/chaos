import { redirect } from "next/navigation";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Explore lives on the public site; preserve bookmarked filters and repeated values. */
export default async function LegacyExplorePage({ searchParams }: Props) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, entry);
  }
  return redirect("/learn" + (query.size ? "?" + query : ""));
}
