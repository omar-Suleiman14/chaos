import { action } from "./_generated/server";
import { v } from "convex/values";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type QuestionPatch = {
  op: "update" | "add" | "delete";
  index?: number; // for "update" and "delete" — 0-based
  question?: {
    type: "mcq" | "true_false";
    questionText: string;
    options?: string[];
    correctAnswer?: string;
    explanation?: string;
    points?: number;
    timeLimit?: number;
  };
};

// ─────────────────────────────────────────────────────────────
// MAIN ACTION
// ─────────────────────────────────────────────────────────────

export const editQuizWithAI = action({
  args: {
    quizTitle: v.string(),
    questions: v.array(v.object({
      type: v.union(v.literal("mcq"), v.literal("true_false")),
      questionText: v.string(),
      options: v.array(v.string()),
      correctAnswer: v.string(),
      explanation: v.string(),
      points: v.number(),
      timeLimit: v.number(),
    })),
    message: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

    const questionsJson = JSON.stringify(
      args.questions.map((q, i) => ({ index: i, ...q })),
      null, 2
    );

    const systemPrompt = `You are an AI quiz editing assistant integrated into a quiz editor.
You are given the current list of quiz questions and a user instruction. 
Produce a JSON response describing the exact changes to make.

QUIZ TITLE: "${args.quizTitle}"

CURRENT QUESTIONS (JSON):
${questionsJson}

ALLOWED QUESTION TYPES: "mcq" (4 options, correctAnswer = exact option text) | "true_false" (options = ["True","False"], correctAnswer = "True" or "False")

RESPONSE FORMAT (output valid JSON only, no markdown):
{
  "changes": [
    { "op": "update", "index": 0, "question": { "type": "mcq", "questionText": "What is the capital of France?", "options": ["Paris","London","Berlin","Madrid"], "correctAnswer": "Paris", "explanation": "Paris is the capital.", "points": 1, "timeLimit": 30 } },
    { "op": "add", "question": { "type": "true_false", "questionText": "The sky is blue.", "options": ["True","False"], "correctAnswer": "True", "explanation": "Rayleigh scattering", "points": 1, "timeLimit": 30 } },
    { "op": "delete", "index": 2 }
  ],
  "summary": "Short human-readable description of what was changed"
}

RULES:
- For "update": provide the full updated question object and the 0-based index
- For "add": provide the full new question object (no index needed)
- For "delete": provide only the index (no question needed)
- For MCQ: correctAnswer MUST be the exact text of one of the options
- For True/False: options MUST be ["True","False"], correctAnswer MUST be "True" or "False"
- If the user asks to add N questions, produce exactly N "add" operations with unique, relevant questions
- If the user asks to improve/reword, produce "update" operations
- Keep explanations short and helpful
- ONLY output valid JSON, nothing else`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://chaos-app.vercel.app",
        "X-Title": "Chaos Quiz AI Editor",
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-nano-12b-v2-vl:free",
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: args.message },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`AI error: ${response.status} — ${err}`);
    }

    const json = await response.json();
    const raw = json.choices?.[0]?.message?.content || "{}";

    let parsed: any;
    try {
      const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      let fixedRaw = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      if (!fixedRaw.endsWith("}")) {
        fixedRaw += "]}"; 
      }
      try {
        parsed = JSON.parse(fixedRaw);
      } catch {
        parsed = { changes: [], summary: "Parsed partially. Some questions may be missing." };
        const cMatches = raw.match(/{\s*"op"\s*:\s*"[^"]+"[\s\S]*?(?=},\s*{|\]\s*})/g);
        if (cMatches) {
          for (const match of cMatches) {
            try { parsed.changes.push(JSON.parse(match + "}")); } catch {}
            try { parsed.changes.push(JSON.parse(match)); } catch {}
          }
        }
      }
    }

    try {
      const changes: QuestionPatch[] = (parsed?.changes || []).filter((c: any) =>
        c && (c.op === "add" || c.op === "update" || c.op === "delete")
      );
      const summary: string = parsed?.summary || "Changes applied.";
      return { changes, summary };
    } catch {
      return { changes: [], summary: "Could not parse AI response. Try rephrasing." };
    }
  },
});
