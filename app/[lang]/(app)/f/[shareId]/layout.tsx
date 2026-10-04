import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { FormTheme } from "@/convex/formLogic";
import { InitialThemeProvider } from "@/components/forms/respond/initial-theme";
import { cache } from "react";
import { formMetadata } from "@/lib/seo";

const publicForm = cache((shareId: string) => fetchQuery(api.respond.getPublicForm, { shareId }));

export async function generateMetadata({ params }: { params: Promise<{ shareId: string }> }): Promise<Metadata> {
  const { shareId } = await params;
  try {
    return formMetadata(await publicForm(shareId), shareId);
  } catch {
    return formMetadata({ state: "unavailable" }, shareId);
  }
}

export default async function FormLayout({ children, params }: { children: React.ReactNode; params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  let theme: FormTheme | null = null;
  try {
    const form = await publicForm(shareId);
    if (form.state !== "unavailable") theme = form.theme as FormTheme;
  } catch {
    // Without it the page still works; it just starts in the default look.
  }
  return <InitialThemeProvider theme={theme}>{children}</InitialThemeProvider>;
}
