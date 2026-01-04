import { Suspense } from 'react';
import QuizResults from '@/components/QuizResults';

export default function ResultsPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#111] text-white flex items-center justify-center">Loading...</div>}>
            <QuizResults />
        </Suspense>
    );
}
