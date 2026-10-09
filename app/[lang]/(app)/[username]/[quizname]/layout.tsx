import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { FormTheme } from "@/convex/formLogic";
import { InitialThemeProvider } from "@/components/forms/respond/initial-theme";
import { cache } from "react";
import { formMetadata } from "@/lib/seo";

type Params = Promise<{ username: string; quizname: string }>;

/** A custom form link, or an old quiz address leading to the quiz form it became. */
const publicForm = cache(async (username: string, quizname: string) => {
  try {
    const link = await fetchQuery(api.links.resolveLink, { username: decodeURIComponent(username), slug: decodeURIComponent(quizname) });
    return link ? { form: await fetchQuery(api.respond.getPublicForm, { shareId: link.shareId }), shareId: link.shareId } : null;
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username, quizname } = await params;
  const result = await publicForm(username, quizname);
  if (!result) return { title: "Page not found", robots: { index: false, follow: false } };
  return formMetadata(result.form, result.shareId);
}

export default async function UsernameLinkLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  const { username, quizname } = await params;
  const result = await publicForm(username, quizname);
  const form = result?.form;
  const theme = form && form.state !== "unavailable" ? (form.theme as FormTheme) : null;
  return <InitialThemeProvider theme={theme}>{children}</InitialThemeProvider>;
}
