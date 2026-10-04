"use client";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { RespondLoading, RespondToForm } from "@/components/forms/respond/RespondPage";
import FallbackBoundary from "@/components/FallbackBoundary";
import QuizPlayerPage from "@/components/quizzes/QuizPlayer";
export default function UsernameLinkRoute() {
 const params = useParams();
 return <FallbackBoundary key={String(params.username)+":"+params.quizname} fallback={<QuizPlayerPage/>}><CustomLinkOrQuiz/></FallbackBoundary>;
}
function CustomLinkOrQuiz() {
 const params = useParams(); const username = params.username as string; const slug = params.quizname as string;
 const link = useQuery(api.links.resolveLink, username && slug ? {username,slug} : "skip");
 if(link===undefined) return <RespondLoading/>;
 return link ? <RespondToForm shareId={link.shareId}/> : <QuizPlayerPage/>;
}
