import { pageMetadata } from "@/lib/seo";
import PublicAuthors from "@/components/site/PublicAuthors";
import { fetchAuthorDirectory } from "./[username]/lookup";

// The author list in the HTML is at most a minute old; the live query updates it on load.
export const revalidate = 60;

export const metadata = pageMetadata("Discover authors", "Meet the people sharing public courses, lessons, forms and quizzes on Chaos.", "/card");
export default async function AuthorsPage() { return <PublicAuthors initial={await fetchAuthorDirectory()} />; }
