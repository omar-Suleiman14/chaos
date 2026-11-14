import type { ExamPlayerQuestion } from "./exam-player-model";

/** Completely synthetic UI examples. No real exam data, answer key or private media is used. */
export const previewQuestions: readonly ExamPlayerQuestion[] = [
  {
    id: "sample-1", kind: "single_choice",
    prompt: "Which chamber pumps blood into the pulmonary artery?",
    choices: [
      { id: "a", text: "Left atrium" },
      { id: "b", text: "Right ventricle" },
      { id: "c", text: "Left ventricle" },
      { id: "d", text: "Right atrium" },
    ],
    caseStudy: {
      stem: "Practice case: A simplified cardiac diagram is shown below. This is not a real examination question.",
      media: [{ id: "diagram", src: "/exam-preview-heart.svg", alt: "Simplified educational outline of a four-chamber heart, without answer labels." }],
    },
  },
  {
    id: "sample-2", kind: "multiple_choice",
    prompt: "Select all examples of vital signs.",
    choices: [
      { id: "a", text: "Heart rate" },
      { id: "b", text: "Respiratory rate" },
      { id: "c", text: "Eye color" },
      { id: "d", text: "Body temperature" },
    ],
  },
  {
    id: "sample-3", kind: "true_false",
    prompt: "True or false: Diastole refers to relaxation and filling of the heart.",
    choices: [{ id: "true", text: "True" }, { id: "false", text: "False" }],
  },
  {
    id: "sample-4", kind: "written",
    prompt: "In one or two sentences, describe the difference between systole and diastole.",
    choices: [],
  },
];
