// 'use client';

// import React, { useState, useEffect, useRef } from 'react';
// import { useRouter } from 'next/navigation';
// import { useQuery, useMutation } from 'convex/react';
// import { api } from '@/convex/_generated/api';
// import { useUser } from '@clerk/nextjs';
// import { CheckCircle, XCircle, Clock, ChevronDown, Volume2, VolumeX, Home, Zap } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import type { QuestionType } from '@/lib/types';
// import type { Id } from '@/convex/_generated/dataModel';

// // Sound effects
// const createAudio = (url: string) => {
//   if (typeof Audio === 'undefined') return null;
//   const audio = new Audio(url);
//   audio.volume = 0.2; // 20% volume
//   return audio;
// };

// const SOUNDS = {
//   correct: createAudio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3'),
//   wrong: createAudio('https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3'),
//   complete: createAudio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'),
// };

// const QuizPlayer: React.FC<{ username: string; slug: string }> = ({ username, slug }) => {
//   const router = useRouter();
//   const { user, isLoaded } = useUser();
//   const quiz = useQuery(api.quizzes.getQuizBySlug, { username, slug });
//   const incrementPlays = useMutation(api.quizzes.incrementPlays);
//   const createAttempt = useMutation(api.attempts.createAttempt);
//   const syncUser = useMutation(api.users.syncClerkUser);

//   const [answers, setAnswers] = useState<Record<string, number[]>>({});
//   const [lockedAnswers, setLockedAnswers] = useState<Record<string, boolean>>({});
//   const [results, setResults] = useState<Record<string, boolean>>({});
//   const [timeLeft, setTimeLeft] = useState(0);
//   const [isCompleted, setIsCompleted] = useState(false);
//   const [soundEnabled, setSoundEnabled] = useState(true);
//   const [startTime] = useState(Date.now());

//   const [convexUserId, setConvexUserId] = useState<Id<"users"> | null>(null);
//   const [syncingUser, setSyncingUser] = useState(false);

//   // Sync Clerk user to Convex
//   useEffect(() => {
//     const syncUserToConvex = async () => {
//       if (user && isLoaded && !syncingUser && !convexUserId) {
//         setSyncingUser(true);
//         try {
//           const syncedUserId = await syncUser({
//             clerkUserId: user.id,
//             email: user.emailAddresses[0]?.emailAddress || '',
//             username: user.username || undefined,
//             name: user.fullName || user.firstName || 'User',
//             imageUrl: user.imageUrl,
//           });
//           setConvexUserId(syncedUserId);
//         } catch (error) {
//           console.error('Failed to sync user:', error);
//         } finally {
//           setSyncingUser(false);
//         }
//       }
//     };
//     syncUserToConvex();
//   }, [user, isLoaded, syncUser, convexUserId]);


//   const containerRef = useRef<HTMLDivElement>(null);
//   const [activeQuestionIndex, setActiveQuestionIndex] = useState(-1);
//   const lastIndexRef = useRef(-1);

//   useEffect(() => {
//     if (quiz?.timeLimitSeconds) {
//       setTimeLeft(quiz.timeLimitSeconds);
//     }
//   }, [quiz]);

//   const hasExecutedRef = useRef(false);

//   useEffect(() => {
//     if (quiz && quiz._id && !hasExecutedRef.current) {
//       incrementPlays({ quizId: quiz._id });
//       hasExecutedRef.current = true;
//     }
//   }, [quiz, incrementPlays]);

//   // Timer logic
//   useEffect(() => {
//     if (!quiz || isCompleted || !quiz.timeLimitSeconds) return;

//     const timer = setInterval(() => {
//       setTimeLeft(prev => {
//         if (prev <= 1) {
//           clearInterval(timer);
//           finishQuiz();
//           return 0;
//         }
//         return prev - 1;
//       });
//     }, 1000);

//     return () => clearInterval(timer);
//   }, [quiz, isCompleted]);

//   // Scroll interaction
//   useEffect(() => {
//     const handleScroll = () => {
//       if (!containerRef.current || !quiz) return;
//       const index = Math.round(containerRef.current.scrollTop / window.innerHeight) - 1;

//       if (index !== activeQuestionIndex) {
//         const prevIndex = lastIndexRef.current;

//         if (prevIndex >= 0 && prevIndex < quiz.questions.length && index > prevIndex) {
//           submitQuestion(prevIndex);
//         }

//         setActiveQuestionIndex(index);
//         lastIndexRef.current = index;
//       }
//     };

//     const container = containerRef.current;
//     if (container) {
//       container.addEventListener('scroll', handleScroll);
//     }
//     return () => container?.removeEventListener('scroll', handleScroll);
//   }, [activeQuestionIndex, answers, lockedAnswers, quiz]);

//   if (!quiz) {
//     return (
//       <div className="h-screen w-full bg-black flex items-center justify-center text-white">
//         <div className="w-8 h-8 border-2 border-chaos-accent border-t-transparent rounded-full animate-spin"></div>
//       </div>
//     );
//   }

//   // Require authentication to view quiz
//   if (isLoaded && !user) {
//     return (
//       <div className="h-screen w-full bg-black flex items-center justify-center text-white">
//         <div className="max-w-md text-center space-y-6 p-8">
//           <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-red-600 rounded-lg blur-[1px] opacity-90 mx-auto"></div>
//           <h2 className="text-3xl font-serif">Sign In Required</h2>
//           <p className="text-gray-400">You need to be signed in to take this quiz.</p>
//           <Button
//             onClick={() => {
//               const currentPath = `/${username}/${slug}`;
//               console.log('QuizPlayer Redirect Debug:', { currentPath, generatedUrl: `/sign-in?returnUrl=${encodeURIComponent(currentPath)}` });
//               router.push(`/sign-in?returnUrl=${encodeURIComponent(currentPath)}`);
//             }}
//             variant="chaos"
//             size="lg"
//             className="w-full"
//           >
//             Sign In to Continue
//           </Button>
//           <Button
//             onClick={() => router.push('/')}
//             variant="ghost"
//             size="sm"
//           >
//             Back to Home
//           </Button>
//         </div>
//       </div>
//     );
//   }

//   // Wait for user sync before showing quiz
//   if (!convexUserId) {
//     return (
//       <div className="h-screen w-full bg-black flex items-center justify-center text-white">
//         <div className="flex flex-col items-center gap-4">
//           <div className="w-12 h-12 border-4 border-chaos-accent border-t-transparent rounded-full animate-spin"></div>
//           <p className="text-gray-400 animate-pulse">Preparing quiz...</p>
//         </div>
//       </div>
//     );
//   }

//   const playSound = (type: 'correct' | 'wrong' | 'complete') => {
//     if (soundEnabled && SOUNDS[type]) {
//       SOUNDS[type]!.currentTime = 0;
//       SOUNDS[type]!.play().catch(() => { });
//     }
//   };

//   const handleSelectOption = (questionId: string, optionIndex: number, type: QuestionType) => {
//     if (lockedAnswers[questionId]) return;

//     setAnswers(prev => {
//       const current = prev[questionId] || [];
//       if (type === 'MCQ') {
//         return { ...prev, [questionId]: [optionIndex] };
//       } else {
//         const newSelection = current.includes(optionIndex)
//           ? current.filter(i => i !== optionIndex)
//           : [...current, optionIndex];
//         return { ...prev, [questionId]: newSelection };
//       }
//     });
//   };

//   const submitQuestion = (index: number) => {
//     const question = quiz.questions[index];
//     if (!question || lockedAnswers[question.id]) return;

//     const selectedOptions = answers[question.id] || [];
//     const isCorrect =
//       selectedOptions.length === question.correctAnswers.length &&
//       selectedOptions.every(val => question.correctAnswers.includes(val));

//     setLockedAnswers(prev => ({ ...prev, [question.id]: true }));
//     setResults(prev => ({ ...prev, [question.id]: isCorrect }));
//     playSound(isCorrect ? 'correct' : 'wrong');
//   };

//   const finishQuiz = async () => {
//     if (isCompleted) return;

//     if (activeQuestionIndex >= 0 && activeQuestionIndex < quiz.questions.length) {
//       submitQuestion(activeQuestionIndex);
//     }

//     setIsCompleted(true);
//     playSound('complete');

//     // Calculate score immediately
//     let score = 0;
//     const breakdown = quiz.questions.map(q => {
//       const selected = answers[q.id] || [];
//       const isCorrect =
//         selected.length === q.correctAnswers.length &&
//         selected.every(val => q.correctAnswers.includes(val));
//       if (isCorrect) score++;
//       return {
//         questionId: q.id,
//         timeSpent: 0,
//         isCorrect,
//         selectedOptions: selected,
//       };
//     });

//     const timeTaken = Math.floor((Date.now() - startTime) / 1000);

//     try {
//       if (!convexUserId) return;

//       await createAttempt({
//         quizId: quiz._id,
//         userId: convexUserId,
//         score,
//         maxScore: quiz.questions.length,
//         timeTakenSeconds: timeTaken,
//         questionBreakdown: breakdown,
//       });
//     } catch (error) {
//       console.error('Failed to save attempt:', error);
//     }
//   };

//   const formatTime = (seconds: number) => {
//     const m = Math.floor(seconds / 60);
//     const s = seconds % 60;
//     return `${m}:${s < 10 ? '0' : ''}${s}`;
//   };

//   return (
//     <div className="relative h-screen w-full bg-black overflow-hidden text-white font-sans">
//       {/* UI Overlays */}
//       <div className="absolute top-4 left-4 z-50 flex gap-4">
//         <Button onClick={() => router.push('/')} variant="secondary" size="icon" className="rounded-full">
//           <Home size={16} />
//         </Button>
//         <Button onClick={() => setSoundEnabled(!soundEnabled)} variant="secondary" size="icon" className="rounded-full">
//           {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
//         </Button>
//       </div>

//       {quiz.timeLimitSeconds && (
//         <div className="absolute top-4 right-4 z-50 bg-black/50 backdrop-blur px-4 py-2 rounded-full border border-white/10 flex items-center gap-2">
//           <Clock size={16} className={timeLeft < 10 ? 'text-red-500' : 'text-white'} />
//           <span className={`font-mono font-bold ${timeLeft < 10 ? 'text-red-500' : ''}`}>{formatTime(timeLeft)}</span>
//         </div>
//       )}

//       {/* Progress Bar */}
//       <div className="absolute top-0 left-0 h-1 bg-gray-800 w-full z-50">
//         <div
//           className="h-full bg-chaos-accent transition-all duration-300"
//           style={{ width: `${Math.max(0, ((activeQuestionIndex + 1) / quiz.questions.length) * 100)}%` }}
//         ></div>
//       </div>

//       {/* Scroll Container */}
//       <div ref={containerRef} className="h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar">
//         {/* Intro Slide */}
//         <div className="h-screen w-full snap-start flex flex-col items-center justify-center p-8 bg-[#0a0a0a] relative">
//           <div className="bg-gradient-to-br from-orange-900/20 to-transparent w-full h-full absolute top-0 left-0 pointer-events-none"></div>
//           <h1 className="text-4xl md:text-6xl font-serif text-center mb-6 relative z-10">{quiz.title}</h1>
//           <p className="text-gray-400 text-center max-w-lg mb-12 relative z-10">{quiz.description}</p>
//           <div className="animate-bounce relative z-10">
//             <ChevronDown size={40} className="text-gray-500" />
//           </div>
//           <p className="text-sm text-gray-600 mt-4 relative z-10 uppercase tracking-widest font-bold text-xs">Scroll to start</p>
//         </div>

//         {quiz.questions.map((q, idx) => {
//           const isLocked = lockedAnswers[q.id];
//           const isCorrect = results[q.id];
//           const selected = answers[q.id] || [];

//           return (
//             <div
//               key={q.id}
//               className="h-screen w-full snap-start relative flex flex-col items-center justify-center p-4 md:p-12 transition-all duration-700 bg-[#121212]"
//             >
//               {/* Architect Grid Background */}
//               <div
//                 className="absolute inset-0 opacity-5 pointer-events-none"
//                 style={{
//                   backgroundImage: `
//                     linear-gradient(to right, #666 1px, transparent 1px),
//                     linear-gradient(to bottom, #666 1px, transparent 1px)
//                   `,
//                   backgroundSize: '30px 30px'
//                 }}
//               ></div>

//               {/* Subtle gradient overlay for feedback */}
//               {isLocked && (
//                 <div
//                   className={`absolute inset-0 pointer-events-none animate-in fade-in duration-700 ${isCorrect
//                     ? 'bg-gradient-to-br from-green-500/8 via-transparent to-transparent'
//                     : 'bg-gradient-to-br from-red-500/8 via-transparent to-transparent'
//                     }`}
//                 ></div>
//               )}

//               <div className="max-w-2xl w-full z-10 flex flex-col justify-center h-full">
//                 <div className="mb-6 md:mb-12">
//                   <span className="inline-block px-3 py-1 bg-white/10 rounded-full text-[10px] md:text-xs font-medium mb-4 backdrop-blur uppercase tracking-wide text-gray-300">
//                     Question {idx + 1}/{quiz.questions.length} • {q.type === 'MULTI_SELECT' ? 'Multi-Select' : 'Single Choice'}
//                   </span>
//                   <h2 className="text-2xl md:text-4xl font-serif leading-tight">{q.text}</h2>
//                 </div>

//                 <div className="space-y-3 md:space-y-4">
//                   {q.options.map((opt, optIdx) => {
//                     const isSelected = selected.includes(optIdx);
//                     let optionClass = 'bg-[#222] border-[#333] hover:bg-[#2a2a2a]';

//                     if (isLocked) {
//                       if (q.correctAnswers.includes(optIdx)) {
//                         optionClass = 'bg-green-500/20 border-green-500 text-green-100';
//                       } else if (isSelected && !isCorrect) {
//                         optionClass = 'bg-red-500/20 border-red-500 text-red-100';
//                       } else {
//                         optionClass = 'bg-[#222] border-[#333] opacity-40';
//                       }
//                     } else if (isSelected) {
//                       optionClass = 'bg-chaos-accent/20 border-chaos-accent text-chaos-accent';
//                     }

//                     return (
//                       <button
//                         key={optIdx}
//                         onClick={() => handleSelectOption(q.id, optIdx, q.type as QuestionType)}
//                         disabled={isLocked}
//                         className={`w-full p-4 md:p-6 text-left rounded-xl border transition-all duration-200 flex justify-between items-center ${optionClass}`}
//                       >
//                         <span className="text-base md:text-lg pr-4">{opt}</span>
//                         {isLocked && q.correctAnswers.includes(optIdx) && <CheckCircle size={20} className="text-green-500 flex-shrink-0" />}
//                         {isLocked && isSelected && !q.correctAnswers.includes(optIdx) && <XCircle size={20} className="text-red-500 flex-shrink-0" />}
//                       </button>
//                     );
//                   })}
//                 </div>

//                 <div className="mt-8 h-24">
//                   {isLocked && (
//                     <div className={`p-4 rounded-lg border backdrop-blur animate-in fade-in slide-in-from-bottom-4 duration-500 ${isCorrect ? 'border-green-500/30 bg-green-900/10' : 'border-red-500/30 bg-red-900/10'
//                       }`}>
//                       <p className="text-sm font-medium mb-1">{isCorrect ? 'Correct!' : 'Incorrect'}</p>
//                       <p className="text-xs md:text-sm opacity-90">{q.explanation}</p>
//                     </div>
//                   )}
//                   {!isLocked && <p className="text-center text-gray-500 text-xs uppercase tracking-widest animate-pulse mt-4">Select & scroll to submit</p>}
//                 </div>
//               </div>
//             </div>
//           );
//         })}

//         {/* Results Slide */}
//         <div className="min-h-screen w-full snap-start flex flex-col items-center justify-center p-6 md:p-12 bg-[#0a0a0a] relative">
//           {/* Architect Grid Background */}
//           <div
//             className="absolute inset-0 opacity-10 pointer-events-none"
//             style={{
//               backgroundImage: `
//                 linear-gradient(to right, #666 1px, transparent 1px),
//                 linear-gradient(to bottom, #666 1px, transparent 1px)
//               `,
//               backgroundSize: '40px 40px'
//             }}
//           ></div>

//           {isCompleted ? (
//             <div className="max-w-5xl w-full space-y-12 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 my-10">
//               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">

//                 {/* Score Card */}
//                 <div className="bg-[#111] border border-white/10 rounded-3xl p-6 md:p-10 text-center relative overflow-hidden group shadow-2xl">
//                   <div className="absolute inset-0 bg-gradient-to-br from-chaos-accent/10 to-transparent opacity-0 group-hover:opacity-100 transition duration-500"></div>

//                   <h3 className="text-gray-400 font-medium uppercase tracking-widest text-sm mb-2">Final Grade</h3>
//                   {(() => {
//                     const percentage = Math.round((Object.values(results).filter(Boolean).length / quiz.questions.length) * 100);
//                     let grade = 'F';
//                     let color = 'text-red-500';

//                     if (percentage === 100) { grade = 'S'; color = 'text-chaos-accent'; }
//                     else if (percentage >= 90) { grade = 'A'; color = 'text-green-400'; }
//                     else if (percentage >= 80) { grade = 'B'; color = 'text-blue-400'; }
//                     else if (percentage >= 70) { grade = 'C'; color = 'text-yellow-400'; }
//                     else if (percentage >= 60) { grade = 'D'; color = 'text-orange-400'; }

//                     return (
//                       <div className={`text-[100px] md:text-[140px] leading-none font-serif font-black ${color} drop-shadow-2xl scale-110 mb-6`}>
//                         {grade}
//                       </div>
//                     );
//                   })()}

//                   <div className="flex justify-center gap-8 text-sm md:text-base">
//                     <div>
//                       <p className="text-gray-500 mb-1">Score</p>
//                       <p className="font-bold text-2xl text-white">{Math.round((Object.values(results).filter(Boolean).length / quiz.questions.length) * 100)}%</p>
//                     </div>
//                     <div className="w-px bg-white/10"></div>
//                     <div>
//                       <p className="text-gray-500 mb-1">Correct</p>
//                       <p className="font-bold text-2xl text-white">{Object.values(results).filter(Boolean).length}/{quiz.questions.length}</p>
//                     </div>
//                   </div>
//                 </div>

//                 {/* Stats & Actions */}
//                 <div className="space-y-6">
//                   <div className="grid grid-cols-2 gap-4">
//                     <div className="bg-[#151515] p-6 rounded-2xl border border-white/5 hover:border-white/10 transition">
//                       <Clock className="mb-3 text-chaos-accent" size={24} />
//                       <p className="text-gray-500 text-xs uppercase tracking-wider">Time Taken</p>
//                       <p className="text-xl font-bold mt-1 text-white">{formatTime(Math.floor((Date.now() - startTime) / 1000))}</p>
//                     </div>
//                     <div className="bg-[#151515] p-6 rounded-2xl border border-white/5 hover:border-white/10 transition">
//                       <Zap className="mb-3 text-yellow-500" size={24} />
//                       <p className="text-gray-500 text-xs uppercase tracking-wider">Speed</p>
//                       <p className="text-xl font-bold mt-1 text-white">{(quiz.questions.length / ((Date.now() - startTime) / 60000)).toFixed(1)} q/m</p>
//                     </div>
//                   </div>

//                   <div className="bg-[#151515] p-8 rounded-2xl border border-white/5">
//                     <p className="text-gray-400 text-sm mb-6 text-center">Ready for your next challenge?</p>
//                     <div className="flex gap-4 flex-col">
//                       <Button
//                         onClick={() => router.push('/dashboard')}
//                         variant="chaos"
//                         size="lg"
//                         className="w-full py-6 text-lg"
//                       >
//                         Return to Dashboard
//                       </Button>
//                       <Button
//                         onClick={() => window.location.reload()}
//                         variant="secondary"
//                         size="lg"
//                         className="w-full"
//                       >
//                         Retry Quiz
//                       </Button>
//                     </div>
//                   </div>
//                 </div>
//               </div>                        variant="secondary"
//               size="lg"
//               className="flex-1 w-full"
//                       >
//               Retry Quiz
//             </Button>
//                     </div>
//       </div>
//     </div>
//               </div >

//   {/* Detailed Breakdown */ }
//   < div className = "border-t border-white/10 pt-8 mt-8" >
//                 <h4 className="font-serif text-2xl mb-6">Performance Breakdown</h4>
//                 <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
//                   {quiz.questions.map((q, idx) => {
//                     const isCorrect = results[q.id];
//                     return (
//                       <div
//                         key={q.id}
//                         className={`p-4 rounded-xl border flex items-center gap-4 transition-all hover:scale-[1.01] ${isCorrect
//                           ? 'border-green-500/20 bg-green-900/5 hover:bg-green-900/10'
//                           : 'border-red-500/20 bg-red-900/5 hover:bg-red-900/10'
//                           }`}
//                       >
//                         <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isCorrect ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
//                           {isCorrect ? <CheckCircle size={16} /> : <XCircle size={16} />}
//                         </div>
//                         <div className="flex-1 min-w-0">
//                           <p className="text-sm font-medium text-gray-200 truncate">{q.text}</p>
//                           <p className="text-xs text-gray-500 mt-0.5">Question {idx + 1}</p>
//                         </div>
//                         {!isCorrect && <span className="text-xs px-2 py-1 bg-white/5 rounded text-gray-400">Review</span>}
//                       </div>
//                     );
//                   })}
//                 </div>
//               </div >
//             </div >
//           ) : (
//   <div className="text-center space-y-6 relative z-10">
//     <h2 className="text-4xl font-serif mb-8">Ready to finish?</h2>
//     <Button onClick={finishQuiz} size="lg" className="bg-white text-black px-8 py-4 rounded-full text-xl hover:scale-105 transition transform">
//       See Your Results
//     </Button>
//   </div>
// )}
//         </div >
//       </div >
//     </div >
//   );
// };

// export default QuizPlayer;

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useUser } from '@clerk/nextjs';
import { CheckCircle, XCircle, Clock, ChevronDown, Volume2, VolumeX, Home, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { QuestionType } from '@/lib/types';
import type { Id } from '@/convex/_generated/dataModel';

// Sound effects
const createAudio = (url: string) => {
  if (typeof Audio === 'undefined') return null;
  const audio = new Audio(url);
  audio.volume = 0.2; // 20% volume
  return audio;
};

const SOUNDS = {
  correct: createAudio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3'),
  wrong: createAudio('https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3'),
  complete: createAudio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'),
};

const QuizPlayer: React.FC<{ username: string; slug: string }> = ({ username, slug }) => {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const quiz = useQuery(api.quizzes.getQuizBySlug, { username, slug });
  const incrementPlays = useMutation(api.quizzes.incrementPlays);
  const createAttempt = useMutation(api.attempts.createAttempt);
  const syncUser = useMutation(api.users.syncClerkUser);

  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [lockedAnswers, setLockedAnswers] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [startTime] = useState(Date.now());

  const [convexUserId, setConvexUserId] = useState<Id<"users"> | null>(null);
  const [syncingUser, setSyncingUser] = useState(false);

  // Sync Clerk user to Convex
  useEffect(() => {
    const syncUserToConvex = async () => {
      if (user && isLoaded && !syncingUser && !convexUserId) {
        setSyncingUser(true);
        try {
          const syncedUserId = await syncUser({
            clerkUserId: user.id,
            email: user.emailAddresses[0]?.emailAddress || '',
            username: user.username || undefined,
            name: user.fullName || user.firstName || 'User',
            imageUrl: user.imageUrl,
          });
          setConvexUserId(syncedUserId);
        } catch (error) {
          console.error('Failed to sync user:', error);
        } finally {
          setSyncingUser(false);
        }
      }
    };
    syncUserToConvex();
  }, [user, isLoaded, syncUser, convexUserId]);


  const containerRef = useRef<HTMLDivElement>(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(-1);
  const lastIndexRef = useRef(-1);

  useEffect(() => {
    if (quiz?.timeLimitSeconds) {
      setTimeLeft(quiz.timeLimitSeconds);
    }
  }, [quiz]);

  const hasExecutedRef = useRef(false);

  useEffect(() => {
    if (quiz && quiz._id && !hasExecutedRef.current) {
      incrementPlays({ quizId: quiz._id });
      hasExecutedRef.current = true;
    }
  }, [quiz, incrementPlays]);

  // Timer logic
  useEffect(() => {
    if (!quiz || isCompleted || !quiz.timeLimitSeconds) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          finishQuiz();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [quiz, isCompleted]);

  // Scroll interaction
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current || !quiz) return;
      const index = Math.round(containerRef.current.scrollTop / window.innerHeight) - 1;

      if (index !== activeQuestionIndex) {
        const prevIndex = lastIndexRef.current;

        if (prevIndex >= 0 && prevIndex < quiz.questions.length && index > prevIndex) {
          submitQuestion(prevIndex);
        }

        setActiveQuestionIndex(index);
        lastIndexRef.current = index;
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
    }
    return () => container?.removeEventListener('scroll', handleScroll);
  }, [activeQuestionIndex, answers, lockedAnswers, quiz]);

  if (!quiz) {
    return (
      <div className="h-screen w-full bg-black flex items-center justify-center text-white">
        <div className="w-8 h-8 border-2 border-chaos-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Require authentication to view quiz
  if (isLoaded && !user) {
    return (
      <div className="h-screen w-full bg-black flex items-center justify-center text-white">
        <div className="max-w-md text-center space-y-6 p-8">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-red-600 rounded-lg blur-[1px] opacity-90 mx-auto"></div>
          <h2 className="text-3xl font-serif">Sign In Required</h2>
          <p className="text-gray-400">You need to be signed in to take this quiz.</p>
          <Button
            onClick={() => {
              const currentPath = `/${username}/${slug}`;
              router.push(`/sign-in?returnUrl=${encodeURIComponent(currentPath)}`);
            }}
            variant="chaos"
            size="lg"
            className="w-full"
          >
            Sign In to Continue
          </Button>
          <Button
            onClick={() => router.push('/')}
            variant="ghost"
            size="sm"
          >
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  // Wait for user sync before showing quiz
  if (!convexUserId) {
    return (
      <div className="h-screen w-full bg-black flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-chaos-accent border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 animate-pulse">Preparing quiz...</p>
        </div>
      </div>
    );
  }

  const playSound = (type: 'correct' | 'wrong' | 'complete') => {
    if (soundEnabled && SOUNDS[type]) {
      SOUNDS[type]!.currentTime = 0;
      SOUNDS[type]!.play().catch(() => { });
    }
  };

  const handleSelectOption = (questionId: string, optionIndex: number, type: QuestionType) => {
    if (lockedAnswers[questionId]) return;

    setAnswers(prev => {
      const current = prev[questionId] || [];
      if (type === 'MCQ') {
        return { ...prev, [questionId]: [optionIndex] };
      } else {
        const newSelection = current.includes(optionIndex)
          ? current.filter(i => i !== optionIndex)
          : [...current, optionIndex];
        return { ...prev, [questionId]: newSelection };
      }
    });
  };

  const submitQuestion = (index: number) => {
    const question = quiz.questions[index];
    if (!question || lockedAnswers[question.id]) return;

    const selectedOptions = answers[question.id] || [];
    const isCorrect =
      selectedOptions.length === question.correctAnswers.length &&
      selectedOptions.every(val => question.correctAnswers.includes(val));

    setLockedAnswers(prev => ({ ...prev, [question.id]: true }));
    setResults(prev => ({ ...prev, [question.id]: isCorrect }));
    playSound(isCorrect ? 'correct' : 'wrong');
  };

  const finishQuiz = async () => {
    if (isCompleted) return;

    if (activeQuestionIndex >= 0 && activeQuestionIndex < quiz.questions.length) {
      submitQuestion(activeQuestionIndex);
    }

    setIsCompleted(true);
    playSound('complete');

    // Calculate score immediately
    let score = 0;
    const breakdown = quiz.questions.map(q => {
      const selected = answers[q.id] || [];
      const isCorrect =
        selected.length === q.correctAnswers.length &&
        selected.every(val => q.correctAnswers.includes(val));
      if (isCorrect) score++;
      return {
        questionId: q.id,
        timeSpent: 0,
        isCorrect,
        selectedOptions: selected,
      };
    });

    const timeTaken = Math.floor((Date.now() - startTime) / 1000);

    try {
      if (!convexUserId) return;

      await createAttempt({
        quizId: quiz._id,
        userId: convexUserId,
        score,
        maxScore: quiz.questions.length,
        timeTakenSeconds: timeTaken,
        questionBreakdown: breakdown,
      });
    } catch (error) {
      console.error('Failed to save attempt:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden text-white font-sans">
      {/* UI Overlays */}
      <div className="absolute top-4 left-4 z-50 flex gap-4">
        <Button onClick={() => router.push('/')} variant="secondary" size="icon" className="rounded-full">
          <Home size={16} />
        </Button>
        <Button onClick={() => setSoundEnabled(!soundEnabled)} variant="secondary" size="icon" className="rounded-full">
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </Button>
      </div>

      {quiz.timeLimitSeconds && (
        <div className="absolute top-4 right-4 z-50 bg-black/50 backdrop-blur px-4 py-2 rounded-full border border-white/10 flex items-center gap-2">
          <Clock size={16} className={timeLeft < 10 ? 'text-red-500' : 'text-white'} />
          <span className={`font-mono font-bold ${timeLeft < 10 ? 'text-red-500' : ''}`}>{formatTime(timeLeft)}</span>
        </div>
      )}

      {/* Progress Bar */}
      <div className="absolute top-0 left-0 h-1 bg-gray-800 w-full z-50">
        <div
          className="h-full bg-chaos-accent transition-all duration-300"
          style={{ width: `${Math.max(0, ((activeQuestionIndex + 1) / quiz.questions.length) * 100)}%` }}
        ></div>
      </div>

      {/* Scroll Container */}
      <div ref={containerRef} className="h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar">
        {/* Intro Slide */}
        <div className="h-screen w-full snap-start flex flex-col items-center justify-center p-8 bg-[#0a0a0a] relative">
          <div className="bg-gradient-to-br from-orange-900/20 to-transparent w-full h-full absolute top-0 left-0 pointer-events-none"></div>
          <h1 className="text-4xl md:text-6xl font-serif text-center mb-6 relative z-10">{quiz.title}</h1>
          <p className="text-gray-400 text-center max-w-lg mb-12 relative z-10">{quiz.description}</p>
          <div className="animate-bounce relative z-10">
            <ChevronDown size={40} className="text-gray-500" />
          </div>
          <p className="text-sm text-gray-600 mt-4 relative z-10 uppercase tracking-widest font-bold text-xs">Scroll to start</p>
        </div>

        {quiz.questions.map((q, idx) => {
          const isLocked = lockedAnswers[q.id];
          const isCorrect = results[q.id];
          const selected = answers[q.id] || [];

          return (
            <div
              key={q.id}
              className="h-screen w-full snap-start relative flex flex-col items-center justify-center p-4 md:p-12 transition-all duration-700 bg-[#121212]"
            >
              {/* Architect Grid Background */}
              <div
                className="absolute inset-0 opacity-5 pointer-events-none"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, #666 1px, transparent 1px),
                    linear-gradient(to bottom, #666 1px, transparent 1px)
                  `,
                  backgroundSize: '30px 30px'
                }}
              ></div>

              {/* Subtle gradient overlay for feedback */}
              {isLocked && (
                <div
                  className={`absolute inset-0 pointer-events-none animate-in fade-in duration-700 ${isCorrect
                    ? 'bg-gradient-to-br from-green-500/8 via-transparent to-transparent'
                    : 'bg-gradient-to-br from-red-500/8 via-transparent to-transparent'
                    }`}
                ></div>
              )}

              <div className="max-w-2xl w-full z-10 flex flex-col justify-center h-full">
                <div className="mb-6 md:mb-12">
                  <span className="inline-block px-3 py-1 bg-white/10 rounded-full text-[10px] md:text-xs font-medium mb-4 backdrop-blur uppercase tracking-wide text-gray-300">
                    Question {idx + 1}/{quiz.questions.length} • {q.type === 'MULTI_SELECT' ? 'Multi-Select' : 'Single Choice'}
                  </span>
                  <h2 className="text-2xl md:text-4xl font-serif leading-tight">{q.text}</h2>
                </div>

                <div className="space-y-3 md:space-y-4">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = selected.includes(optIdx);
                    let optionClass = 'bg-[#222] border-[#333] hover:bg-[#2a2a2a]';

                    if (isLocked) {
                      if (q.correctAnswers.includes(optIdx)) {
                        optionClass = 'bg-green-500/20 border-green-500 text-green-100';
                      } else if (isSelected && !isCorrect) {
                        optionClass = 'bg-red-500/20 border-red-500 text-red-100';
                      } else {
                        optionClass = 'bg-[#222] border-[#333] opacity-40';
                      }
                    } else if (isSelected) {
                      optionClass = 'bg-chaos-accent/20 border-chaos-accent text-chaos-accent';
                    }

                    return (
                      <button
                        key={optIdx}
                        onClick={() => handleSelectOption(q.id, optIdx, q.type as QuestionType)}
                        disabled={isLocked}
                        className={`w-full p-4 md:p-6 text-left rounded-xl border transition-all duration-200 flex justify-between items-center ${optionClass}`}
                      >
                        <span className="text-base md:text-lg pr-4">{opt}</span>
                        {isLocked && q.correctAnswers.includes(optIdx) && <CheckCircle size={20} className="text-green-500 flex-shrink-0" />}
                        {isLocked && isSelected && !q.correctAnswers.includes(optIdx) && <XCircle size={20} className="text-red-500 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-8 h-24">
                  {isLocked && (
                    <div className={`p-4 rounded-lg border backdrop-blur animate-in fade-in slide-in-from-bottom-4 duration-500 ${isCorrect ? 'border-green-500/30 bg-green-900/10' : 'border-red-500/30 bg-red-900/10'
                      }`}>
                      <p className="text-sm font-medium mb-1">{isCorrect ? 'Correct!' : 'Incorrect'}</p>
                      <p className="text-xs md:text-sm opacity-90">{q.explanation}</p>
                    </div>
                  )}
                  {!isLocked && <p className="text-center text-gray-500 text-xs uppercase tracking-widest animate-pulse mt-4">Select & scroll to submit</p>}
                </div>
              </div>
            </div>
          );
        })}

        {/* Results Slide */}
        <div className="min-h-screen w-full snap-start flex flex-col items-center justify-center p-6 md:p-12 bg-[#0a0a0a] relative">
          {/* Architect Grid Background */}
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(to right, #666 1px, transparent 1px),
                linear-gradient(to bottom, #666 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px'
            }}
          ></div>

          {isCompleted ? (
            <div className="max-w-5xl w-full space-y-12 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 my-10">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">

                {/* Score Card */}
                <div className="bg-[#111] border border-white/10 rounded-3xl p-6 md:p-10 text-center relative overflow-hidden group shadow-2xl">
                  <div className="absolute inset-0 bg-gradient-to-br from-chaos-accent/10 to-transparent opacity-0 group-hover:opacity-100 transition duration-500"></div>

                  <h3 className="text-gray-400 font-medium uppercase tracking-widest text-sm mb-2">Final Grade</h3>
                  {(() => {
                    const percentage = Math.round((Object.values(results).filter(Boolean).length / quiz.questions.length) * 100);
                    let grade = 'F';
                    let color = 'text-red-500';

                    if (percentage === 100) { grade = 'S'; color = 'text-chaos-accent'; }
                    else if (percentage >= 90) { grade = 'A'; color = 'text-green-400'; }
                    else if (percentage >= 80) { grade = 'B'; color = 'text-blue-400'; }
                    else if (percentage >= 70) { grade = 'C'; color = 'text-yellow-400'; }
                    else if (percentage >= 60) { grade = 'D'; color = 'text-orange-400'; }

                    return (
                      <div className={`text-[100px] md:text-[140px] leading-none font-serif font-black ${color} drop-shadow-2xl scale-110 mb-6`}>
                        {grade}
                      </div>
                    );
                  })()}

                  <div className="flex justify-center gap-8 text-sm md:text-base">
                    <div>
                      <p className="text-gray-500 mb-1">Score</p>
                      <p className="font-bold text-2xl text-white">{Math.round((Object.values(results).filter(Boolean).length / quiz.questions.length) * 100)}%</p>
                    </div>
                    <div className="w-px bg-white/10"></div>
                    <div>
                      <p className="text-gray-500 mb-1">Correct</p>
                      <p className="font-bold text-2xl text-white">{Object.values(results).filter(Boolean).length}/{quiz.questions.length}</p>
                    </div>
                  </div>
                </div>

                {/* Stats & Actions */}
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#151515] p-6 rounded-2xl border border-white/5 hover:border-white/10 transition">
                      <Clock className="mb-3 text-chaos-accent" size={24} />
                      <p className="text-gray-500 text-xs uppercase tracking-wider">Time Taken</p>
                      <p className="text-xl font-bold mt-1 text-white">{formatTime(Math.floor((Date.now() - startTime) / 1000))}</p>
                    </div>
                    <div className="bg-[#151515] p-6 rounded-2xl border border-white/5 hover:border-white/10 transition">
                      <Zap className="mb-3 text-yellow-500" size={24} />
                      <p className="text-gray-500 text-xs uppercase tracking-wider">Speed</p>
                      <p className="text-xl font-bold mt-1 text-white">{(quiz.questions.length / ((Date.now() - startTime) / 60000)).toFixed(1)} q/m</p>
                    </div>
                  </div>

                  <div className="bg-[#151515] p-8 rounded-2xl border border-white/5">
                    <p className="text-gray-400 text-sm mb-6 text-center">Ready for your next challenge?</p>
                    <div className="flex gap-4 flex-col">
                      <Button
                        onClick={() => router.push('/dashboard')}
                        variant="chaos"
                        size="lg"
                        className="w-full py-6 text-lg"
                      >
                        Return to Dashboard
                      </Button>
                      <Button
                        onClick={() => window.location.reload()}
                        variant="secondary"
                        size="lg"
                        className="w-full"
                      >
                        Retry Quiz
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Breakdown */}
              <div className="border-t border-white/10 pt-8 mt-8">
                <h4 className="font-serif text-2xl mb-6">Performance Breakdown</h4>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {quiz.questions.map((q, idx) => {
                    const isCorrect = results[q.id];
                    return (
                      <div
                        key={q.id}
                        className={`p-4 rounded-xl border flex items-center gap-4 transition-all hover:scale-[1.01] ${isCorrect
                          ? 'border-green-500/20 bg-green-900/5 hover:bg-green-900/10'
                          : 'border-red-500/20 bg-red-900/5 hover:bg-red-900/10'
                          }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isCorrect ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                          {isCorrect ? <CheckCircle size={16} /> : <XCircle size={16} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-200 truncate">{q.text}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Question {idx + 1}</p>
                        </div>
                        {!isCorrect && <span className="text-xs px-2 py-1 bg-white/5 rounded text-gray-400">Review</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-6 relative z-10">
              <h2 className="text-4xl font-serif mb-8">Ready to finish?</h2>
              <Button onClick={finishQuiz} size="lg" className="bg-white text-black px-8 py-4 rounded-full text-xl hover:scale-105 transition transform">
                See Your Results
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuizPlayer;