'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useUser, UserButton } from '@clerk/nextjs';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Plus, LayoutDashboard, Brain, Trash2, Check, Save, Copy, ExternalLink, Minus, History, TrendingUp, Users, Trophy, Target, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { TimePicker } from '@/components/ui/time-picker';
import type { Question, QuestionType } from '@/lib/types';
import type { Id } from '@/convex/_generated/dataModel';

const Dashboard: React.FC = () => {
  const { user, isLoaded } = useUser();

  // Debug logs
  console.log('Dashboard Render:', { isLoaded, user: !!user });

  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'create' | 'history' | 'stats'>('overview');
  const [selectedQuizId, setSelectedQuizId] = useState<Id<"quizzes"> | null>(null);
  const [editingQuizId, setEditingQuizId] = useState<Id<"quizzes"> | null>(null);
  const [syncingUser, setSyncingUser] = useState(false);
  const [convexUserId, setConvexUserId] = useState<Id<"users"> | null>(null);

  const syncUser = useMutation(api.users.syncClerkUser);

  // Sync Clerk user to Convex on mount
  React.useEffect(() => {
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

          console.log('Synced Convex user ID:', syncedUserId);
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

  const userId = convexUserId;
  const quizzes = useQuery(api.quizzes.getUserQuizzes, userId ? { userId } : 'skip');
  const takenQuizzes = useQuery(api.attempts.getTakenQuizzes, userId ? { userId } : 'skip');
  const stats = useQuery(api.attempts.getCreatorStats, userId ? { userId } : 'skip');
  const quizAnalytics = useQuery(api.attempts.getQuizAnalytics, selectedQuizId ? { quizId: selectedQuizId } : 'skip');

  const createQuizMutation = useMutation(api.quizzes.createQuiz);
  const updateQuizMutation = useMutation(api.quizzes.updateQuiz);
  const deleteAttemptsMutation = useMutation(api.attempts.deleteAttemptsForQuiz);

  // Quiz creation state
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDesc, setQuizDesc] = useState('');
  const [hasTimer, setHasTimer] = useState(true);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(2);
  const [createdQuestions, setCreatedQuestions] = useState<Question[]>([]);

  // Share modal
  const [shareModalData, setShareModalData] = useState<{ url: string, title: string } | null>(null);

  // Current question editing
  const [currentQText, setCurrentQText] = useState('');
  const [currentQType, setCurrentQType] = useState<QuestionType>('MCQ' as QuestionType);
  const [currentOptions, setCurrentOptions] = useState<string[]>(['', '', '', '']);
  const [currentCorrectIndices, setCurrentCorrectIndices] = useState<number[]>([]);
  const [currentExplanation, setCurrentExplanation] = useState('');

  // Redirect if not authenticated
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#121212] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-chaos-accent border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  // Handle stuck loading state or auth errors
  if (isLoaded && !user) {
    router.push('/');
    return null;
  }

  // Loading States
  if (quizzes === undefined || stats === undefined) {
    return (
      <div className="min-h-screen bg-[#121212] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-chaos-accent border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 animate-pulse">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const handleAddOption = () => {
    setCurrentOptions([...currentOptions, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (currentOptions.length <= 2) return; // Minimum 2 options
    setCurrentOptions(currentOptions.filter((_, i) => i !== index));
    setCurrentCorrectIndices(currentCorrectIndices.filter(i => i !== index).map(i => i > index ? i - 1 : i));
  };

  const handleAddQuestion = () => {
    if (!currentQText || currentCorrectIndices.length === 0 || currentOptions.some(o => !o.trim())) {
      alert('Please fill out all fields and select at least one correct answer.');
      return;
    }

    const newQuestion: Question = {
      id: Math.random().toString(36).substr(2, 9),
      text: currentQText,
      type: currentQType,
      options: currentOptions.filter(o => o.trim()),
      correctAnswers: currentCorrectIndices,
      explanation: currentExplanation || 'No explanation provided.',
      order: createdQuestions.length,
    };

    setCreatedQuestions([...createdQuestions, newQuestion]);
    setCurrentQText('');
    setCurrentOptions(['', '', '', '']);
    setCurrentCorrectIndices([]);
    setCurrentExplanation('');
  };

  const toggleCorrectIndex = (idx: number) => {
    if (currentQType === 'MCQ') {
      setCurrentCorrectIndices([idx]);
    } else {
      setCurrentCorrectIndices(prev =>
        prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
      );
    }
  };

  const generateSlug = (title: string) => {
    return title.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
  };

  const handleEditQuiz = (quiz: any) => {
    setEditingQuizId(quiz._id as Id<"quizzes">);
    setQuizTitle(quiz.title);
    setQuizDesc(quiz.description);
    setHasTimer(!!quiz.timeLimitSeconds);
    setTimeLimitMinutes(quiz.timeLimitSeconds ? quiz.timeLimitSeconds / 60 : 2);
    setCreatedQuestions(quiz.questions);
    setActiveTab('create');
  };

  const handlePublishQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createdQuestions.length === 0) {
      alert('Please add at least one question.');
      return;
    }

    const slug = generateSlug(quizTitle || 'untitled-quiz');

    try {
      if (!userId) return;

      if (editingQuizId) {
        if (!confirm('Saving changes will RESET all previous attempts for this quiz. Continue?')) {
          return;
        }

        await updateQuizMutation({
          quizId: editingQuizId,
          title: quizTitle || 'Untitled Quiz',
          slug,
          description: quizDesc || 'A challenging quiz.',
          questions: createdQuestions,
          timeLimitSeconds: hasTimer ? timeLimitMinutes * 60 : undefined,
        });

        await deleteAttemptsMutation({ quizId: editingQuizId });
        setEditingQuizId(null);
      } else {
        await createQuizMutation({
          creatorId: userId!,
          creatorUsername: user.username || user.firstName || 'user',
          title: quizTitle || 'Untitled Quiz',
          slug,
          description: quizDesc || 'A challenging quiz.',
          questions: createdQuestions,
          timeLimitSeconds: hasTimer ? timeLimitMinutes * 60 : undefined,
        });
      }

      const shareUrl = `${window.location.origin}/${user.username || user.firstName || 'user'}/${slug}`;
      setShareModalData({ url: shareUrl, title: quizTitle });

      setQuizTitle('');
      setQuizDesc('');
      setTimeLimitMinutes(2);
      setCreatedQuestions([]);
      setHasTimer(true);
      setEditingQuizId(null);
    } catch (error) {
      alert('Failed to save quiz');
    }
  };

  const viewData = [
    { name: 'Mon', views: stats?.totalViews ? Math.floor(stats.totalViews * 0.1) : 0 },
    { name: 'Tue', views: stats?.totalViews ? Math.floor(stats.totalViews * 0.2) : 0 },
    { name: 'Wed', views: stats?.totalViews ? Math.floor(stats.totalViews * 0.15) : 0 },
    { name: 'Thu', views: stats?.totalViews ? Math.floor(stats.totalViews * 0.3) : 0 },
    { name: 'Fri', views: stats?.totalViews ? Math.floor(stats.totalViews * 0.1) : 0 },
    { name: 'Sat', views: stats?.totalViews ? Math.floor(stats.totalViews * 0.05) : 0 },
    { name: 'Sun', views: stats?.totalViews ? Math.floor(stats.totalViews * 0.1) : 0 },
  ];

  return (
    <div className="min-h-screen bg-[#121212] text-white font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0f0f0f] border-b border-[#222]">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo */}
          <button onClick={() => router.push('/')} className="flex items-center gap-2 hover:opacity-80 transition">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-600 rounded-lg blur-[1px] opacity-90"></div>
            <span className="font-serif text-2xl italic hidden md:inline">Chaos</span>
          </button>

          {/* Tab Navigation */}
          <nav className="flex gap-0.5 sm:gap-1 md:gap-2">
            <Button
              onClick={() => setActiveTab('overview')}
              variant={activeTab === 'overview' ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs px-2 sm:px-3 md:text-sm"
            >
              <LayoutDashboard className="mr-0 md:mr-2" size={16} />
              <span className="hidden md:inline">Dashboard</span>
            </Button>
            <Button
              onClick={() => setActiveTab('content')}
              variant={activeTab === 'content' ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs px-2 sm:px-3 md:text-sm"
            >
              <Brain className="mr-0 md:mr-2" size={16} />
              <span className="hidden md:inline">Quizzes</span>
            </Button>
            <Button
              onClick={() => setActiveTab('history')}
              variant={activeTab === 'history' ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs px-2 sm:px-3 md:text-sm"
            >
              <History className="mr-0 md:mr-2" size={16} />
              <span className="hidden md:inline">History</span>
            </Button>
            <Button
              onClick={() => setActiveTab('stats')}
              variant={activeTab === 'stats' ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs px-2 sm:px-3 md:text-sm"
            >
              <TrendingUp className="mr-0 md:mr-2" size={16} />
              <span className="hidden md:inline">Stats</span>
            </Button>
            <Button
              onClick={() => { setActiveTab('create'); setEditingQuizId(null); setQuizTitle(''); setCreatedQuestions([]); }}
              variant={activeTab === 'create' ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs px-2 sm:px-3 md:text-sm"
            >
              <Plus className="mr-0 md:mr-2" size={16} />
              <span className="hidden md:inline">Create</span>
            </Button>
          </nav>

          {/* Profile - Use Clerk UserButton */}
          <div>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {/* ... (Overview) ... */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="space-y-6">
              <Card className="p-6">
                <h3 className="text-gray-400 text-sm font-medium mb-1">Total Views</h3>
                <p className="text-3xl font-bold">{stats?.totalViews || 0}</p>
              </Card>
              <div className="grid grid-cols-2 gap-4 sm:gap-6">
                <Card className="p-6">
                  <h3 className="text-gray-400 text-sm font-medium mb-1">Quizzes</h3>
                  <p className="text-2xl font-bold">{stats?.totalQuizzes || 0}</p>
                </Card>
                <Card className="p-6">
                  <h3 className="text-gray-400 text-sm font-medium mb-1">Avg. Score</h3>
                  <p className="text-2xl font-bold text-chaos-accent">{stats?.avgScore || 0}%</p>
                </Card>
              </div>
            </div>
            <Card className="lg:col-span-2 p-6">
              <h3 className="text-lg font-medium mb-6">Engagement Activity</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={viewData}>
                    <XAxis dataKey="name" stroke="#555" tickLine={false} axisLine={false} />
                    <YAxis stroke="#555" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#222', border: '1px solid #333', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="views" fill="#D4BFA3" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        )}

        {/* Content Tab (My Quizzes) */}
        {activeTab === 'content' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <p className="text-gray-400">Manage your published quizzes.</p>
              <Button onClick={() => { setActiveTab('create'); setEditingQuizId(null); setQuizTitle(''); setCreatedQuestions([]); }}>+ New Quiz</Button>
            </div>

            {!quizzes || quizzes.length === 0 ? (
              <Card className="p-20 text-center">
                <p className="text-gray-500">No quizzes yet. Start creating!</p>
              </Card>
            ) : (
              <div className="grid gap-4">
                {quizzes.map((quiz) => (
                  <Card key={quiz._id} className="p-4 md:p-6">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                      <div className="flex-1">
                        <h3 className="font-bold text-base md:text-lg">{quiz.title}</h3>
                        <div className="flex flex-wrap gap-2 md:gap-4 text-xs text-gray-500 mt-1">
                          <span>{quiz.questions.length} Questions</span>
                          <span>•</span>
                          <span>{quiz.plays} Plays</span>
                          {quiz.timeLimitSeconds && (
                            <>
                              <span>•</span>
                              <span>{Math.floor(quiz.timeLimitSeconds / 60)}m Timer</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 md:gap-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleEditQuiz(quiz)}
                          className="flex-1 sm:flex-none"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const url = `${window.location.origin}/${user.username}/${quiz.slug}`;
                            const copyToClipboard = async (text: string) => {
                              try {
                                if (navigator.clipboard && window.isSecureContext) {
                                  await navigator.clipboard.writeText(text);
                                  alert('Link copied to clipboard!');
                                } else {
                                  // Fallback for iOS/non-secure contexts
                                  const textArea = document.createElement("textarea");
                                  textArea.value = text;
                                  textArea.style.position = "fixed";
                                  textArea.style.left = "-9999px";
                                  textArea.style.top = "0";
                                  document.body.appendChild(textArea);
                                  textArea.focus();
                                  textArea.select();
                                  try {
                                    document.execCommand('copy');
                                    alert('Link copied to clipboard!');
                                  } catch (err) {
                                    console.error('Fallback: Oops, unable to copy', err);
                                    alert('Failed to copy link manually. Please copy the URL from the browser bar.');
                                  }
                                  document.body.removeChild(textArea);
                                }
                              } catch (err) {
                                console.error('Failed to copy!', err);
                              }
                            };
                            copyToClipboard(url);
                          }}
                          className="flex-1 sm:flex-none"
                        >
                          <Copy className="mr-0 sm:mr-2" size={14} />
                          <span className="hidden sm:inline">Copy Link</span>
                          <span className="sm:hidden">Copy</span>
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => router.push(`/${user.username}/${quiz.slug}`)}
                          className="flex-1 sm:flex-none"
                        >
                          <ExternalLink size={14} className="mr-0 sm:mr-1" />
                          <span className="hidden sm:inline">Preview</span>
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats Tab - Quiz Analytics */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            {!selectedQuizId ? (
              <>
                <p className="text-gray-400">Select a quiz to view detailed analytics.</p>
                {!quizzes || quizzes.length === 0 ? (
                  <Card className="p-20 text-center">
                    <p className="text-gray-500">No quizzes yet. Create one first!</p>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {quizzes.map((quiz) => (
                      <Card key={quiz._id} className="p-6 hover:border-chaos-accent/50 transition cursor-pointer" onClick={() => setSelectedQuizId(quiz._id)}>
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="font-bold text-lg">{quiz.title}</h3>
                            <div className="flex gap-4 text-xs text-gray-500 mt-1">
                              <span>{quiz.questions.length} Questions</span>
                              <span>•</span>
                              <span>{quiz.plays} Plays</span>
                            </div>
                          </div>
                          <TrendingUp className="text-chaos-accent" size={24} />
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-6">
                <Button onClick={() => setSelectedQuizId(null)} variant="ghost" size="sm">
                  ← Back to Quiz List
                </Button>

                {quizAnalytics === undefined ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-chaos-accent border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : quizAnalytics === null || quizAnalytics.totalAttempts === 0 ? (
                  <Card className="p-20 text-center">
                    <p className="text-gray-500">No one has taken this quiz yet.</p>
                  </Card>
                ) : (
                  <>
                    {/* Overview Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <Card className="p-6">
                        <div className="flex items-center gap-3 mb-2">
                          <Users className="text-chaos-accent" size={20} />
                          <h3 className="text-gray-400 text-sm font-medium">Total Takers</h3>
                        </div>
                        <p className="text-3xl font-bold">{quizAnalytics.totalAttempts}</p>
                      </Card>
                      <Card className="p-6">
                        <div className="flex items-center gap-3 mb-2">
                          <TrendingUp className="text-green-400" size={20} />
                          <h3 className="text-gray-400 text-sm font-medium">Average Score</h3>
                        </div>
                        <p className="text-3xl font-bold text-green-400">{quizAnalytics.averageScore}%</p>
                      </Card>
                      <Card className="p-6">
                        <div className="flex items-center gap-3 mb-2">
                          <Trophy className="text-yellow-400" size={20} />
                          <h3 className="text-gray-400 text-sm font-medium">Top Score</h3>
                        </div>
                        <p className="text-3xl font-bold text-yellow-400">{quizAnalytics.leaderboard[0]?.percentage || 0}%</p>
                      </Card>
                      <Card className="p-6">
                        <div className="flex items-center gap-3 mb-2">
                          <Target className="text-blue-400" size={20} />
                          <h3 className="text-gray-400 text-sm font-medium">Hardest Question</h3>
                        </div>
                        <p className="text-3xl font-bold text-blue-400">Q{(quizAnalytics.questionAnalysis.sort((a, b) => a.successRate - b.successRate)[0]?.questionIndex || 0) + 1}</p>
                      </Card>
                    </div>

                    {/* Leaderboard */}
                    <Card className="p-6">
                      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                        <Trophy className="text-yellow-400" /> Leaderboard
                      </h3>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {quizAnalytics.leaderboard.map((attempt, index) => (
                          <div key={attempt.attemptId} className="flex items-center gap-4 p-3 bg-[#1a1a1a] rounded-lg border border-[#333]">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                              index === 1 ? 'bg-gray-400/20 text-gray-300' :
                                index === 2 ? 'bg-orange-600/20 text-orange-400' :
                                  'bg-[#252525] text-gray-500'
                              }`}>
                              {index + 1}
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">{attempt.userName}</p>
                              <p className="text-xs text-gray-500">{attempt.userEmail}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-chaos-accent">{attempt.percentage}%</p>
                              <p className="text-xs text-gray-500">{Math.floor(attempt.timeTaken / 60)}:{(attempt.timeTaken % 60).toString().padStart(2, '0')}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>

                    {/* Question Analysis */}
                    <Card className="p-6">
                      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                        <Target className="text-blue-400" /> Question Analysis
                      </h3>
                      <div className="space-y-3">
                        {quizAnalytics.questionAnalysis.map((qa) => (
                          <div key={qa.questionId} className="p-4 bg-[#1a1a1a] rounded-lg border border-[#333]">
                            <div className="flex items-start gap-3">
                              <div className="flex-1">
                                <p className="font-medium mb-2">
                                  <span className="text-chaos-accent mr-2">Q{qa.questionIndex + 1}.</span>
                                  {qa.questionText}
                                </p>
                                <div className="flex gap-6 text-sm">
                                  <div>
                                    <span className="text-gray-500">Correct: </span>
                                    <span className="text-green-400 font-medium">{qa.correctCount}/{qa.totalAttempts}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Success Rate: </span>
                                    <span className={`font-medium ${qa.successRate >= 70 ? 'text-green-400' :
                                      qa.successRate >= 40 ? 'text-yellow-400' :
                                        'text-red-400'
                                      }`}>{qa.successRate}%</span>
                                  </div>
                                </div>
                              </div>
                              <div className="w-16 h-16 rounded-full border-4 flex items-center justify-center font-bold ${
                                qa.successRate >= 70 ? 'border-green-400 text-green-400' :
                                qa.successRate >= 40 ? 'border-yellow-400 text-yellow-400' :
                                'border-red-400 text-red-400'
                              }">
                                {qa.successRate}%
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>

                    {/* All Attempts */}
                    <Card className="p-6">
                      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                        <History className="text-purple-400" /> All Attempts
                      </h3>
                      <div className="space-y-3 max-h-[500px] overflow-y-auto">
                        {quizAnalytics.attemptsWithUsers.map((attempt) => (
                          <div key={attempt.attemptId} className="p-4 bg-[#1a1a1a] rounded-lg border border-[#333]">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <p className="font-medium">{attempt.userName}</p>
                                <p className="text-sm text-gray-500">{attempt.userEmail}</p>
                                <p className="text-xs text-gray-600 mt-1">
                                  {new Date(attempt.completedAt).toLocaleDateString()} at {new Date(attempt.completedAt).toLocaleTimeString()}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-bold text-chaos-accent">{attempt.percentage}%</p>
                                <p className="text-xs text-gray-500">{attempt.score}/{attempt.maxScore} correct</p>
                              </div>
                            </div>
                            {/* Quick Overview */}
                            <div className="flex flex-wrap gap-2 mb-4">
                              {attempt.questionBreakdown.map((qb, index) => (
                                <div
                                  key={qb.questionId}
                                  className={`px-3 py-1.5 rounded text-xs font-medium ${qb.isCorrect
                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                    }`}
                                >
                                  Q{index + 1} {qb.isCorrect ? '✓' : '✗'}
                                </div>
                              ))}
                            </div>

                            {/* Wrong Answers Detail */}
                            {(() => {
                              const wrongQuestions = attempt.questionBreakdown.filter((qb) => !qb.isCorrect);
                              if (wrongQuestions.length === 0) return null;

                              // Get quiz from selected quiz
                              const selectedQuiz = quizzes?.find(q => q._id === selectedQuizId);
                              if (!selectedQuiz) return null;

                              return (
                                <div className="mt-4 pt-4 border-t border-[#333] space-y-4">
                                  <h5 className="text-sm font-semibold text-gray-400">Wrong Answers ({wrongQuestions.length})</h5>
                                  {wrongQuestions.map((qb) => {
                                    const question = selectedQuiz.questions.find(q => q.id === qb.questionId);
                                    if (!question) return null;

                                    const questionIndex = attempt.questionBreakdown.findIndex(item => item.questionId === qb.questionId);

                                    return (
                                      <div key={qb.questionId} className="bg-[#252525] border border-red-500/20 rounded-xl p-4 space-y-3">
                                        {/* Question Header */}
                                        <div className="flex items-start gap-2">
                                          <div className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0 font-bold text-xs">
                                            Q{questionIndex + 1}
                                          </div>
                                          <p className="text-sm font-medium text-white flex-1">{question.text}</p>
                                        </div>

                                        {/* User's Answer */}
                                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                          <p className="text-xs text-red-400 uppercase tracking-wider mb-1.5 font-semibold">
                                            Their Answer{qb.selectedOptions.length > 1 ? 's' : ''}:
                                          </p>
                                          <div className="space-y-1">
                                            {qb.selectedOptions.length > 0 ? (
                                              qb.selectedOptions.map((answerIdx) => (
                                                <div key={answerIdx} className="flex items-center gap-1.5">
                                                  <XCircle size={12} className="text-red-400 flex-shrink-0" />
                                                  <span className="text-xs text-red-200">{question.options[answerIdx]}</span>
                                                </div>
                                              ))
                                            ) : (
                                              <p className="text-xs text-red-300 italic">No answer selected</p>
                                            )}
                                          </div>
                                        </div>

                                        {/* Correct Answer */}
                                        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                                          <p className="text-xs text-green-400 uppercase tracking-wider mb-1.5 font-semibold">
                                            Correct Answer{question.correctAnswers.length > 1 ? 's' : ''}:
                                          </p>
                                          <div className="space-y-1">
                                            {question.correctAnswers.map((answerIdx) => (
                                              <div key={answerIdx} className="flex items-center gap-1.5">
                                                <CheckCircle size={12} className="text-green-400 flex-shrink-0" />
                                                <span className="text-xs text-green-200">{question.options[answerIdx]}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                        ))}
                      </div>
                    </Card>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6">
            <p className="text-gray-400">Quizzes you've taken recently.</p>

            {!takenQuizzes || takenQuizzes.length === 0 ? (
              <Card className="p-20 text-center">
                <p className="text-gray-500">You haven't taken any quizzes yet.</p>
              </Card>
            ) : (
              <div className="grid gap-4">
                {takenQuizzes.map((quiz) => (
                  <Card key={quiz._id} className="p-6 flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-lg">{quiz.title}</h3>
                      <div className="flex gap-4 text-xs text-gray-500 mt-1">
                        <span>By @{quiz.creatorUsername}</span>
                        <span>•</span>
                        <span>{quiz.questions.length} Questions</span>
                      </div>
                    </div>
                    <Button
                      variant="chaos"
                      size="sm"
                      onClick={() => router.push(`/${quiz.creatorUsername}/${quiz.slug}`)}
                    >
                      Retake Quiz
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create Tab */}
        {activeTab === 'create' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            <div className="lg:col-span-2 space-y-8">
              <Card className="p-6">
                <h3 className="text-lg font-medium border-b border-[#333] pb-2 mb-4">Quiz Details</h3>
                <div className="space-y-4">
                  <div>
                    <Label>Title</Label>
                    <Input value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} placeholder="Advanced Physics" className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input value={quizDesc} onChange={(e) => setQuizDesc(e.target.value)} placeholder="What is this quiz about?" className="mt-1.5" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={hasTimer} onCheckedChange={(checked) => setHasTimer(!!checked)} />
                    <Label>Enable Timer</Label>
                  </div>
                  {hasTimer && (
                    <div>
                      <Label>Time Limit</Label>
                      <TimePicker value={timeLimitMinutes} onChange={setTimeLimitMinutes} className="mt-1.5" />
                    </div>
                  )}
                </div>
              </Card>

              <Card className="p-6 border-l-4 border-l-chaos-accent">
                <div className="flex justify-between items-center border-b border-[#333] pb-4 mb-4">
                  <h3 className="text-lg font-medium">Add Question {createdQuestions.length + 1}</h3>
                  <div className="flex gap-2">
                    <Button size="sm" variant={currentQType === 'MCQ' ? 'default' : 'secondary'} onClick={() => setCurrentQType('MCQ' as QuestionType)}>
                      Single Choice
                    </Button>
                    <Button size="sm" variant={currentQType === 'MULTI_SELECT' ? 'default' : 'secondary'} onClick={() => setCurrentQType('MULTI_SELECT' as QuestionType)}>
                      Multi Select
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Question Text</Label>
                    <Textarea value={currentQText} onChange={(e) => setCurrentQText(e.target.value)} placeholder="Enter your question..." className="mt-1.5" />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <Label>Options</Label>
                      <Button size="sm" variant="outline" onClick={handleAddOption}><Plus size={14} /> Add Option</Button>
                    </div>
                    <div className="space-y-3">
                      {currentOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <button
                            onClick={() => toggleCorrectIndex(idx)}
                            className={`w-6 h-6 rounded-full border flex items-center justify-center transition flex-shrink-0 ${currentCorrectIndices.includes(idx) ? 'bg-green-500 border-green-500' : 'border-gray-500 hover:border-white'
                              }`}
                          >
                            {currentCorrectIndices.includes(idx) && <Check size={14} className="text-black" />}
                          </button>
                          <Input value={opt} onChange={(e) => { const newOpts = [...currentOptions]; newOpts[idx] = e.target.value; setCurrentOptions(newOpts); }} placeholder={`Option ${idx + 1}`} />
                          {currentOptions.length > 2 && (
                            <Button size="icon" variant="ghost" onClick={() => handleRemoveOption(idx)}>
                              <Minus size={16} />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label>Explanation</Label>
                    <Textarea value={currentExplanation} onChange={(e) => setCurrentExplanation(e.target.value)} placeholder="Why is the answer correct?" className="mt-1.5 h-16" />
                  </div>

                  <Button onClick={handleAddQuestion} className="w-full">
                    <Plus className="mr-2" size={18} /> Add Question
                  </Button>
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
                <h3 className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-4">Quiz Draft</h3>
                {createdQuestions.length === 0 ? (
                  <p className="text-gray-600 italic text-sm text-center py-10">Questions will appear here.</p>
                ) : (
                  <div className="space-y-4">
                    {createdQuestions.map((q, i) => (
                      <div key={i} className="bg-[#252525] p-4 rounded-lg border border-[#333] relative group">
                        <p className="font-medium text-sm mb-2">
                          <span className="text-chaos-accent mr-2">Q{i + 1}.</span>{q.text}
                        </p>
                        <div className="space-y-1.5">
                          {q.options.map((opt, oi) => (
                            <div key={oi} className={`text-xs px-2 py-1.5 rounded ${q.correctAnswers.includes(oi) ? 'bg-green-900/30 text-green-400 border border-green-900/50' : 'text-gray-500'}`}>
                              {opt}
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => setCreatedQuestions(createdQuestions.filter((_, idx) => idx !== i))}
                          className="absolute top-2 right-2 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Button
                onClick={handlePublishQuiz}
                disabled={createdQuestions.length === 0}
                variant="chaos"
                className="w-full py-6 text-lg"
              >
                <Save className="mr-2" size={20} /> Publish Quiz
              </Button>
            </div>
          </div>
        )}

        {/* Share Modal */}
        <Dialog open={!!shareModalData} onOpenChange={() => setShareModalData(null)}>
          <DialogContent>
            <DialogHeader>
              <div className="w-12 h-12 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check size={24} />
              </div>
              <DialogTitle className="text-center">Quiz Published!</DialogTitle>
              <DialogDescription className="text-center">Your quiz is ready to be shared.</DialogDescription>
            </DialogHeader>

            <div className="bg-[#111] border border-[#333] p-3 rounded-lg flex items-center gap-2">
              <input readOnly value={shareModalData?.url || ''} className="bg-transparent text-sm text-gray-300 w-full outline-none" />
              <Button size="sm" onClick={() => { navigator.clipboard.writeText(shareModalData?.url || ''); }}>
                Copy
              </Button>
            </div>

            <div className="flex gap-3 mt-4">
              <Button variant="secondary" className="flex-1" onClick={() => { setShareModalData(null); setActiveTab('content'); }}>
                Close
              </Button>
              <Button className="flex-1" onClick={() => window.open(shareModalData?.url, '_blank')}>
                View Live
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default Dashboard;