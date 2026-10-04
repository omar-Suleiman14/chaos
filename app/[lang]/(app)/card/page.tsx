import { pageMetadata } from "@/lib/seo";
import PublicAuthors from "@/components/site/PublicAuthors";

export const metadata = pageMetadata("Discover authors", "Meet the people sharing public courses, lessons, forms and quizzes on Chaos.", "/card");
export default function AuthorsPage() { return <PublicAuthors />; }
