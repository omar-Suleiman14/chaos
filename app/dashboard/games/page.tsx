import { redirect } from "next/navigation";

/** Games live in the Library's Games tab. */
export default function GamesPage() {
  redirect("/dashboard?tab=games");
}
