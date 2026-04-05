"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Id } from "@/convex/_generated/dataModel";

const ADMIN_EMAILS = ["support@chaos.fail", "khomod14@gmail.com"];

const TYPE_LABELS: Record<string, string> = {
  mcq: "MCQ",
  true_false: "True / False",
  multi_select: "Multi Select",
  written: "Written",
};

export default function PrintQuizPage() {
  const params = useParams();
  const router = useRouter();
  const quizId = params.quizId as Id<"quizzes">;

  const { user, isLoaded } = useUser();
  const quiz = useQuery(api.quizFunctions.getQuiz, quizId ? { quizId } : "skip");
  const questions = useQuery(api.quizFunctions.getQuestions, quizId ? { quizId } : "skip");
  const currentUser = useQuery(api.quizFunctions.getCurrentUser);

  const userEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? "";
  const isAdmin = ADMIN_EMAILS.includes(userEmail);
  const isOwner = currentUser && quiz && quiz.creatorId === currentUser.clerkId;
  const isAuthorized = isAdmin || isOwner;

  useEffect(() => {
    if (quiz && questions && isAuthorized) {
      const timer = setTimeout(() => window.print(), 600);
      return () => clearTimeout(timer);
    }
  }, [quiz, questions, isAuthorized]);

  useEffect(() => {
    if (isLoaded && quiz !== undefined && currentUser !== undefined && !isAuthorized) {
      router.replace("/dashboard");
    }
  }, [isLoaded, quiz, currentUser, isAuthorized, router]);

  if (!quiz || !questions || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm opacity-50">Preparing PDF...</p>
      </div>
    );
  }

  const totalMarks = questions.reduce((s: number, q: any) => s + q.points, 0);

  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }

        @media print {
          .no-print { display: none !important; }
          html, body, * {
            background: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-body { padding: 8mm 12mm !important; }
          .q-card { break-inside: avoid; page-break-inside: avoid; }
          .answer-section { break-before: page; page-break-before: always; }
          /* force borders/badges black in print */
          .type-badge { background: #111 !important; color: white !important; }
          .q-num { background: #111 !important; color: white !important; }
          .option-row { border-color: #ddd !important; }
          .answer-val { color: #1a6b2e !important; }
        }

        * { box-sizing: border-box; }

        body {
          font-family: 'Georgia', serif;
          background: #f5f5f5;
          color: #111;
          margin: 0;
        }

        /* ── Screen toolbar ── */
        .screen-header {
          padding: 14px 24px;
          background: #fff;
          border-bottom: 2px solid #111;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .print-btn {
          background: #111; color: white; border: none;
          padding: 10px 24px; font-weight: bold;
          font-family: monospace; cursor: pointer;
          font-size: 13px; letter-spacing: 1px;
        }
        .print-btn:hover { background: #333; }
        .back-btn {
          background: transparent; border: 2px solid #111;
          padding: 8px 16px; font-weight: bold;
          font-family: monospace; cursor: pointer; font-size: 12px;
        }

        /* ── Page wrapper ── */
        .print-body {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px 24px 40px;
        }

        /* ── Quiz header block ── */
        .quiz-header {
          margin-bottom: 28px;
          padding-bottom: 18px;
          border-bottom: 3px solid #111;
        }
        .quiz-title {
          font-size: 28px;
          font-weight: 900;
          letter-spacing: -0.5px;
          margin: 0 0 6px;
          text-transform: uppercase;
          line-height: 1.2;
        }
        .quiz-meta {
          font-size: 12px;
          color: #666;
          font-family: 'Courier New', monospace;
        }

        /* ── Name / Date line ── */
        .name-row {
          display: flex;
          gap: 32px;
          margin-bottom: 32px;
        }
        .name-line {
          border-bottom: 1px solid #111;
          padding-bottom: 4px;
          font-size: 13px;
          color: #555;
        }

        /* ── Question card ── */
        .q-card {
          border: none;
          margin-bottom: 12px;
          overflow: hidden;
        }

        .q-card-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 6px;
        }

        .q-num {
          width: 26px;
          height: 26px;
          background: #111;
          color: white;
          font-family: 'Courier New', monospace;
          font-weight: bold;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .type-badge {
          background: #111;
          color: white;
          font-family: 'Courier New', monospace;
          font-size: 10px;
          font-weight: bold;
          letter-spacing: 0.5px;
          padding: 2px 6px;
          text-transform: uppercase;
        }

        .q-marks {
          font-family: 'Courier New', monospace;
          font-size: 11px;
          color: #555;
        }

        .q-card-body {
          padding: 4px 6px 4px;
        }

        .q-text {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.4;
          margin-bottom: 6px;
          color: #111;
        }

        /* ── Options ── */
        .option-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 8px;
          border: 1px solid #e5e5e5;
          margin-bottom: 4px;
          font-size: 12px;
          color: #333;
        }
        .option-chevron {
          color: #999;
          font-size: 13px;
          flex-shrink: 0;
        }
        .option-label {
          color: #555;
          margin-right: 2px;
        }

        /* ── True/False ── */
        .tf-row {
          display: flex;
          gap: 12px;
          margin-top: 2px;
          margin-bottom: 4px;
        }
        .tf-option {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 8px;
          border: 1px solid #e5e5e5;
          font-size: 12px;
          color: #333;
        }

        /* ── Written ── */
        .written-line {
          border-bottom: 1px solid #bbb;
          height: 24px;
          margin-bottom: 4px;
        }

        /* ── Explanation ── */
        .q-explanation {
          font-size: 11px;
          font-style: italic;
          color: #666;
          border-left: 3px solid #ddd;
          padding: 4px 8px;
          margin: 4px 0 6px;
          line-height: 1.4;
          background: #fbfbfb;
        }

        /* ── Answer Key ── */
        .answer-section {
          padding-top: 0;
        }
        .answer-section-title {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: -0.5px;
          text-transform: uppercase;
          border-bottom: 3px solid #111;
          padding-bottom: 12px;
          margin-bottom: 20px;
        }
        .answer-row {
          display: flex;
          align-items: baseline;
          gap: 10px;
          font-size: 13px;
          padding: 8px 0;
          border-bottom: 1px solid #eee;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .answer-num {
          font-family: monospace;
          font-weight: bold;
          min-width: 32px;
          color: #111;
        }
        .answer-val {
          font-weight: bold;
          color: #1a6b2e;
          flex: 1;
        }
        .answer-marks {
          font-family: monospace;
          font-size: 11px;
          color: #888;
          white-space: nowrap;
        }
        .answer-exp {
          font-size: 11px;
          color: #666;
          font-style: italic;
          margin-top: 2px;
        }
      `}</style>

      {/* Screen toolbar */}
      <div className="screen-header no-print">
        <div>
          <span style={{ fontFamily: "monospace", fontSize: 12, color: "#555" }}>PRINT PREVIEW</span>
          <strong style={{ display: "block", fontSize: 18 }}>{quiz.title}</strong>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="print-btn" onClick={() => window.print()}> PRINT / SAVE PDF</button>
        </div>
      </div>

      {/* Page content */}
      <div className="print-body">

        {/* Questions */}
        {questions.map((q: any, i: number) => (
          <div key={q._id} className="q-card">
            {/* Card header */}
            <div className="q-card-header">
              <div className="q-num">{i + 1}</div>
              <span className="type-badge">{TYPE_LABELS[q.type] ?? q.type}</span>
              <span className="q-marks">{q.points} mark{q.points !== 1 ? "s" : ""}</span>
            </div>

            {/* Card body */}
            <div className="q-card-body">
              <div className="q-text">{q.questionText}</div>

              {/* MCQ / Multi Select */}
              {(q.type === "mcq" || q.type === "multi_select") && q.options?.map((opt: string, oi: number) => (
                <div key={oi} className="option-row">
                  <span className="option-chevron">›</span>
                  <span className="option-label">{String.fromCharCode(97 + oi)})</span>
                  <span>{opt}</span>
                </div>
              ))}

              {/* True / False */}
              {q.type === "true_false" && (
                <div className="tf-row">
                  <div className="tf-option"><span className="option-chevron">›</span> True</div>
                  <div className="tf-option"><span className="option-chevron">›</span> False</div>
                </div>
              )}

              {/* Written */}
              {q.type === "written" && (
                <>
                  <div className="written-line" />
                  <div className="written-line" />
                  <div className="written-line" />
                </>
              )}

              {/* Explanation */}
              {q.explanation && (
                <div className="q-explanation">{q.explanation}</div>
              )}
            </div>
          </div>
        ))}

        {/* Answer Key */}
        <div className="answer-section">
          <div className="answer-section-title">Answer Key</div>
          <div style={{ fontSize: 11, fontFamily: "monospace", color: "#666", marginBottom: 20 }}>
            ⚠ INSTRUCTOR COPY — DO NOT DISTRIBUTE
          </div>

          {questions.map((q: any, i: number) => {
            let answer = "—";
            if (q.type === "mcq" && q.correctAnswer) {
              const idx = q.options?.indexOf(q.correctAnswer);
              const letter = idx !== undefined && idx >= 0 ? `${String.fromCharCode(97 + idx)}) ` : "";
              answer = `${letter}${q.correctAnswer}`;
            } else if (q.type === "true_false") {
              answer = q.correctAnswer || "—";
            } else if (q.type === "multi_select" && q.correctAnswers) {
              answer = q.correctAnswers.map((a: string) => {
                const idx = q.options?.indexOf(a);
                return idx !== undefined && idx >= 0 ? `${String.fromCharCode(97 + idx)}) ${a}` : a;
              }).join(", ");
            } else if (q.type === "written") {
              answer = q.keywords?.length
                ? `Keywords: ${q.keywords.join(", ")}`
                : q.correctAnswer || "(open-ended)";
            }

            return (
              <div key={q._id} className="answer-row">
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="answer-num">Q{i + 1}.</span>
                    <span className="answer-val">{answer}</span>
                    <span className="answer-marks">[{q.points} mark{q.points !== 1 ? "s" : ""}]</span>
                  </div>
                  {q.explanation && <div className="answer-exp">{q.explanation}</div>}
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 32, paddingTop: 16, borderTop: "2px solid #111", fontSize: 11, fontFamily: "monospace", color: "#aaa" }}>
            Generated by chaos.fail &nbsp;·&nbsp; {new Date().toLocaleDateString()}
          </div>
        </div>
      </div>
    </>
  );
}
