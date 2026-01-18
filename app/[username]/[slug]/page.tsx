import QuizPlayer from '@/components/QuizPlayer';

export default async function QuizPage({
    params,
}: {
    params: Promise<{ username: string; slug: string }>;
}) {
    const resolvedParams = await params;
    return <QuizPlayer username={resolvedParams.username} slug={resolvedParams.slug} />;
}
