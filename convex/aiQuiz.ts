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
        throw new Error("AI failed to generate valid questions. Try again or use a different document.");
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
      temperature: 0.7,
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
  const truncatedText = text.slice(0, 40000);
  const results: GeneratedQuestion[] = [];

  // ── MCQ batch ──────────────────────────────────────────────
  if (params.mcq > 0) {
    const systemPrompt = `You are an expert exam creator. Generate EXACTLY ${params.mcq} multiple-choice questions from the provided document text.

RULES:
- Difficulty: ${params.difficulty}
- Every question MUST have type "mcq"
- Every question MUST have exactly 4 options
- "answer" MUST be the EXACT text of one of the 4 options (the correct one)
- Every question must be unique and cover different parts of the document
- Base questions ONLY on the provided document

OUTPUT: valid JSON only, no markdown, no extra text.
FORMAT:
{ "questions": [{ "type": "mcq", "question": "What is the capital of France?", "options": ["Paris","London","Berlin","Madrid"], "answer": "Paris", "explanation": "Paris is the capital of France." }] }`;

    const raw = await callOpenRouterText(apiKey, systemPrompt, "DOCUMENT TEXT:\n" + truncatedText);
    const parsed = parseQuestionsFromAI(raw).filter(q => q.type === "mcq");
    results.push(...parsed);
  }

  // ── True/False batch ───────────────────────────────────────
  if (params.trueFalse > 0) {
    const systemPrompt = `You are an expert exam creator. Generate EXACTLY ${params.trueFalse} true/false questions from the provided document text.

RULES:
- Difficulty: ${params.difficulty}
- Every question MUST have type "true_false"
- "answer" MUST be a JSON boolean: true or false (NOT the string "true" or "false")
- Every question must be unique and cover different parts of the document
- Base questions ONLY on the provided document

OUTPUT: valid JSON only, no markdown, no extra text.
FORMAT:
{ "questions": [{ "type": "true_false", "question": "...", "answer": true, "explanation": "..." }] }`;

    const raw = await callOpenRouterText(apiKey, systemPrompt, "DOCUMENT TEXT:\n" + truncatedText);
    const parsed = parseQuestionsFromAI(raw).filter(q => q.type === "true_false");
    results.push(...parsed);
  }

  // Validate and deduplicate across all batches
  return validateQuestions(results);
}

async function parseExistingQuizFromText(
  text: string,
  apiKey: string
): Promise<GeneratedQuestion[]> {
  const systemPrompt = `You are an expert quiz digitizer. You have been provided with the extracted text of an existing quiz.

Extract the questions exactly as they appear in the text.

For each question found:
- Determine its type (mcq, true_false)
- Extract all answer options
- Mark the correct answer if visible (e.g. circled, checked, or in an answer key), otherwise leave it completely blank
- Extract explanation if present, otherwise leave blank

Output format (JSON):
{
  "questions": [
    { "type": "mcq", "question": "", "options": ["", "", "", ""], "answer": "", "explanation": "" },
    { "type": "true_false", "question": "", "answer": true, "explanation": "" },
  ]
}

Only extract what is present in the document. Do not invent questions.`;

  const raw = await callOpenRouterText(apiKey, systemPrompt, "QUIZ TEXT:\n" + text.slice(0, 40000));
  return parseQuestionsFromAI(raw);
}

function parseQuestionsFromAI(raw: string): GeneratedQuestion[] {
  let parsed: any;
  try {
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback if JSON is truncated or malformed
    let fixedRaw = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    if (!fixedRaw.endsWith("}")) {
      fixedRaw += "]}"; // rough attempt to close it
    }
    try {
      parsed = JSON.parse(fixedRaw);
    } catch {
      // Last resort: regex extracting objects that look like questions
      parsed = { questions: [] };
      const qMatches = raw.match(/{\s*"type"\s*:\s*"[^"]+"[\s\S]*?(?=},\s*{|\]\s*})/g);
      if (qMatches) {
        for (const match of qMatches) {
          try { parsed.questions.push(JSON.parse(match + "}")); } catch {}
          try { parsed.questions.push(JSON.parse(match)); } catch {}
        }
      }
    }
  }

  const qs = parsed?.questions || [];

  return qs
    .filter((q: any) => q && (q.question || q.questionText))
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
      return {
        type: "mcq",
        questionText,
        options: (q.options || []).filter(Boolean),
        answer: typeof q.answer === "string" ? q.answer : "",
        explanation: q.explanation || "",
      };
    });
}

/**
 * Post-parse validation: deduplicate, drop MCQs with missing/invalid answers,
 * drop T/F without a boolean answer.
 */
function validateQuestions(questions: GeneratedQuestion[]): GeneratedQuestion[] {
  const seen = new Set<string>();
  const valid: GeneratedQuestion[] = [];

  for (const q of questions) {
    // Deduplicate by normalised question text
    const key = q.questionText.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    if (q.type === "mcq") {
      // Must have options and the answer must be one of the options
      if (!q.options || q.options.length < 2) continue;
      if (!q.answer) continue;
      const ansLower = q.answer.toLowerCase().trim();
      const optMatch = q.options.find(o => o.toLowerCase().trim() === ansLower);
      if (!optMatch) continue;
      // Normalise answer to exact option text
      q.answer = optMatch;
    }

    if (q.type === "true_false") {
      // answerBool must have been resolved
      if (q.answerBool === undefined || q.answerBool === null) continue;
    }

    valid.push(q);
  }

  return valid;
}
