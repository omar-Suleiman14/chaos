import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';

const SharedQuizResolver: React.FC = () => {
  const { username, slug } = useParams();
  const { getQuizBySlug } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (username && slug) {
      const quiz = getQuizBySlug(username, slug);
      if (quiz) {
        // We found the quiz! Navigate to the player with the ID
        // Note: In a real app with backend, we would fetch by slug here.
        navigate(`/quiz/${quiz.id}`, { replace: true });
      } else {
        // Quiz not found logic
        console.error("Quiz not found");
        navigate('/');
      }
    }
  }, [username, slug, getQuizBySlug, navigate]);

  return (
    <div className="h-screen w-full bg-black flex items-center justify-center text-white flex-col gap-4">
      <div className="w-8 h-8 border-2 border-chaos-accent border-t-transparent rounded-full animate-spin"></div>
      <p className="text-gray-400 text-sm">Loading Quiz...</p>
    </div>
  );
};

export default SharedQuizResolver;