import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './components/Landing';
import Dashboard from './components/Dashboard';
import QuizPlayer from './components/QuizPlayer';
import QuizResults from './components/QuizResults';
import SharedQuizResolver from './components/SharedQuizResolver';
import { StoreProvider } from './store';

const App: React.FC = () => {
  return (
    <StoreProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/quiz/:quizId" element={<QuizPlayer />} />
          <Route path="/results" element={<QuizResults />} />
          {/* Custom Share URL Route */}
          <Route path="/u/:username/:slug" element={<SharedQuizResolver />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </StoreProvider>
  );
};

export default App;