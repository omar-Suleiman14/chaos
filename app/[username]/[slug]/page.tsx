'use client';

import { use } from 'react';
import QuizPlayer from '@/components/QuizPlayer';

export default function UserQuizPage({
    params,
}: {
    params: Promise<{ username: string; slug: string }>;
}) {
    const { username, slug } = use(params);

    return <QuizPlayer username={username} slug={slug} />;
}
