import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const runAIQuizGeneration = action({
  args: {
    jobId: v.id("aiJobs"),
    extractedText: v.string(),
    mode: v.union(v.literal("quiz"), v.literal("lecture")),
    quizTitle: v.string(),
    totalQuestions: v.optional(v.number()),
    mcq: v.optional(v.number()),
    multiSelect: v.optional(v.number()),
    trueFalse: v.optional(v.number()),
    written: v.optional(v.number()),
    difficulty: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const clerkId = identity.subject;
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not set in Convex environment variables");

    try {
      if (!args.extractedText || args.extractedText.trim().length < 20) {
        throw new Error("Extracted text is too short or empty. Please ensure the document is readable.");
      }

      // ── Step 1: Process based on mode ───────────────────
      let questions: GeneratedQuestion[];

      if (args.mode === "quiz") {
        await ctx.runMutation(internal.aiQuizMutations.updateAIJob, {
          jobId: args.jobId,
          status: "generating",
          step: "Parsing quiz questions from document...",
        });
        questions = await parseExistingQuizFromText(args.extractedText, apiKey);
      } else {
        await ctx.runMutation(internal.aiQuizMutations.updateAIJob, {
          jobId: args.jobId,
          status: "categorizing",
          step: "Analyzing lecture document...",
        });
        
        questions = await generateQuestionsFromText(
          args.extractedText,
          {
            total: Math.min(args.totalQuestions ?? 10, 50),
            mcq: args.mcq ?? 5,
            multiSelect: args.multiSelect ?? 2,
            trueFalse: args.trueFalse ?? 2,
            written: args.written ?? 1,
            difficulty: args.difficulty ?? "medium",
          },
          apiKey
        );
      }

      if (!questions || questions.length === 0) {
        throw new Error("Failed to generate any valid questions from the document.");
      }

      // ── Step 2: Save ─────────────────────────────────────
      await ctx.runMutation(internal.aiQuizMutations.updateAIJob, {
        jobId: args.jobId,
        status: "saving",
        step: "Saving quiz to database...",
      });

      const quizId: any = await ctx.runMutation(
        internal.aiQuizMutations.saveGeneratedQuiz,
        { clerkId, title: args.quizTitle, questions }
      );

      await ctx.runMutation(internal.aiQuizMutations.updateAIJob, {
        jobId: args.jobId,
        status: "done",
        step: "Done!",
        quizId,
      });
    } catch (err: any) {
      await ctx.runMutation(internal.aiQuizMutations.updateAIJob, {
        jobId: args.jobId,
        status: "error",
        step: "Failed",
        error: err?.message || "Unknown error",
      });
    }
  },
});

// ─────────────────────────────────────────────────────────────
// AI HELPERS (Text-based)
// ─────────────────────────────────────────────────────────────

type GeneratedQuestion = {
  type: "mcq" | "true_false" | "multi_select" | "written";
  questionText: string;
  options?: string[];
  answer?: string;
  answers?: string[];
  answerBool?: boolean;
  keywords?: string[];
  explanation?: string;
};

async function callOpenRouterText(
  apiKey: string,
  systemPrompt: string,
  userText: string
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://chaos-app.vercel.app",
      "X-Title": "Chaos Quiz AI",
    },
    body: JSON.stringify({
      model: "nvidia/nemotron-nano-12b-v2-vl:free",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter error: ${response.status} — ${err}`);
  }
  const json = await response.json();
  return json.choices?.[0]?.message?.content || "{}";
}

async function generateQuestionsFromText(
  text: string,
  params: { total: number; mcq: number; multiSelect: number; trueFalse: number; written: number; difficulty: string },
  apiKey: string
): Promise<GeneratedQuestion[]> {
  const systemPrompt = `You are an expert exam creator and educational analyst.
You have been provided with the extracted text of a document (lecture notes, slides, or reading material).

Your task is to comprehensively analyze the text and generate a high-quality quiz based ONLY on the provided content.

Requirements:
- Total questions: ${params.total} (MAX 50)
- MCQ: ${params.mcq}
- Multi-select: ${params.multiSelect}
- True/False: ${params.trueFalse}
- Written: ${params.written}
- Difficulty: ${params.difficulty}

General Rules:
- Questions MUST be reasoning-based, not direct recall
- Avoid simple definitions
- Each question should require understanding, application, or analysis

Quality Rules:
- No repetition, no vague questions
- Each question must be clearly answerable from the content within the document
- Do NOT use external knowledge
- For written questions, include a keywords array of 3-6 key terms that a correct answer must contain

Output format (JSON):
{
  "questions": [
    { "type": "mcq", "question": "", "options": ["", "", "", ""], "answer": "", "explanation": "" },
    { "type": "multi_select", "question": "", "options": ["", "", "", ""], "answers": [], "explanation": "" },
    { "type": "true_false", "question": "", "answer": true, "explanation": "" },
    { "type": "written", "question": "", "answer": "", "keywords": [], "explanation": "" }
  ]
}`;

  const raw = await callOpenRouterText(apiKey, systemPrompt, "DOCUMENT TEXT:\n" + text.slice(0, 40000));
  return parseQuestionsFromAI(raw);
}

async function parseExistingQuizFromText(
  text: string,
  apiKey: string
): Promise<GeneratedQuestion[]> {
  const systemPrompt = `You are an expert quiz digitizer. You have been provided with the extracted text of an existing quiz.

Extract the questions exactly as they appear in the text.

For each question found:
- Determine its type (mcq, true_false, multi_select, written)
- Extract all answer options
- Mark the correct answer if visible (e.g. circled, checked, or in an answer key), otherwise leave it completely blank
- Extract explanation if present, otherwise leave blank
- For written questions, extract 3-5 keywords from the expected answer (or question context) for autograding

Output format (JSON):
{
  "questions": [
    { "type": "mcq", "question": "", "options": ["", "", "", ""], "answer": "", "explanation": "" },
    { "type": "true_false", "question": "", "answer": true, "explanation": "" },
    { "type": "multi_select", "question": "", "options": ["", "", "", ""], "answers": [], "explanation": "" },
    { "type": "written", "question": "", "answer": "", "keywords": [], "explanation": "" }
  ]
}

Only extract what is present in the document. Do not invent questions.`;

  const raw = await callOpenRouterText(apiKey, systemPrompt, "QUIZ TEXT:\n" + text.slice(0, 40000));
  return parseQuestionsFromAI(raw);
}

function parseQuestionsFromAI(raw: string): GeneratedQuestion[] {
  try {
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const qs = parsed.questions || [];

    return qs
      .filter((q: any) => q.question || q.questionText)
      .slice(0, 50)
      .map((q: any): GeneratedQuestion => {
        const type = q.type as GeneratedQuestion["type"];
        const questionText = (q.question || q.questionText || "").trim();

        if (type === "true_false") {
          return {
            type: "true_false",
            questionText,
            answerBool: q.answer === true || q.answer === "true" || q.answer === "True" || q.answer === "T",
            explanation: q.explanation || "",
          };
        }
        if (type === "multi_select") {
          return {
            type: "multi_select",
            questionText,
            options: (q.options || []).filter(Boolean),
            answers: Array.isArray(q.answers) ? q.answers : [],
            explanation: q.explanation || "",
          };
        }
        if (type === "written") {
          return {
            type: "written",
            questionText,
            answer: q.answer || "",
            keywords: Array.isArray(q.keywords) ? q.keywords : [],
            explanation: q.explanation || "",
          };
        }
        return {
          type: "mcq",
          questionText,
          options: (q.options || []).filter(Boolean),
          answer: q.answer || "",
          explanation: q.explanation || "",
        };
      });
  } catch {
    return [];
  }
}
