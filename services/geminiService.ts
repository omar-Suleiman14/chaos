import { GoogleGenAI, Type } from "@google/genai";
import { Question, QuestionType } from "../types";
import { v4 as uuidv4 } from 'uuid'; // We will mock uuid since no package provided

// Mock UUID for simplicity in this environment
const generateId = () => Math.random().toString(36).substring(2, 15);

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const generateQuizQuestions = async (topic: string, count: number): Promise<Question[]> => {
  if (!apiKey) {
    console.warn("No API Key found, returning mock data");
    return mockQuestions(count);
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Create a difficult academic quiz about "${topic}" with ${count} questions.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING, description: "The question text" },
              type: { type: Type.STRING, enum: ["MCQ", "MULTI_SELECT"], description: "Type of question" },
              options: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "4 distinct options"
              },
              correctIndices: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: "0-based indices of correct answers"
              },
              explanation: { type: Type.STRING, description: "Brief academic explanation of why the answer is correct" }
            },
            required: ["text", "type", "options", "correctIndices", "explanation"]
          }
        }
      }
    });

    const rawData = JSON.parse(response.text || "[]");
    
    return rawData.map((q: any) => ({
      id: generateId(),
      text: q.text,
      type: q.type === "MULTI_SELECT" ? QuestionType.MULTI_SELECT : QuestionType.MCQ,
      options: q.options,
      correctAnswers: q.correctIndices,
      explanation: q.explanation
    }));

  } catch (error) {
    console.error("Gemini API Error:", error);
    return mockQuestions(count);
  }
};

const mockQuestions = (count: number): Question[] => {
  return Array.from({ length: count }).map((_, i) => ({
    id: generateId(),
    text: `Sample Question ${i + 1}: What is the powerhouse of the cell?`,
    type: QuestionType.MCQ,
    options: ["Nucleus", "Mitochondria", "Ribosome", "Golgi Apparatus"],
    correctAnswers: [1],
    explanation: "Mitochondria are often referred to as the powerhouse of the cell because they generate most of the cell's supply of adenosine triphosphate (ATP)."
  }));
}