"use client";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { RespondLoading, RespondToForm } from "@/components/forms/respond/RespondPage";
import ErrorScreen from "@/components/site/ErrorScreen";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: { title: "Nothing here", body: "This page doesn't exist or isn't available to you.", home: "Go home" },
  ar: { title: "لا شيء هنا", body: "هذه الصفحة غير موجودة أو غير متاحة لك.", home: "الصفحة الرئيسية" },
};

/** chaos.fail/<username>/<slug>: a custom form link, or an old quiz address leading to the quiz form it became. */
export default function UsernameLinkRoute() {
 const t = useCopy(copy);
 const params = useParams(); const username = params.username as string; const slug = params.quizname as string;
 const link = useQuery(api.links.resolveLink, username && slug ? {username,slug} : "skip");
 if(link===undefined) return <RespondLoading/>;
 return link ? <RespondToForm shareId={link.shareId}/> : <ErrorScreen illustration="not-found" title={t.title} body={t.body} primary={{ label: t.home, href: "/" }}/>;
}
