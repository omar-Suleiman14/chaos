"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { haptics } from "@/lib/haptics";
import { Settings2, Clock, CheckSquare, Zap, Target } from "lucide-react";

export default function SettingsPage() {
  const globalConfig = useQuery(api.quizFunctions.getGlobalConfig);
  const settings = useQuery(api.quizFunctions.getTeacherSettings);
  const updateSettings = useMutation(api.quizFunctions.updateTeacherSettings);

  const [form, setForm] = useState({
    defaultMcqTimer: 60,
    defaultWrittenTimer: 300,
    defaultPointsPerQuestion: 1,
    halfMarkThreshold: 50,
    randomizeQuestions: false,
    randomizeOptions: true,
    showCorrectAnswers: true,
    showExplanations: true,
    displayMode: "score" as "score" | "pass_fail",
    passingThreshold: 50,
    disableAnimations: false,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (settings !== undefined && globalConfig !== undefined) {
      const dbSettings: any = settings || {};
      const fallback: any = globalConfig || {};
      setForm({
        defaultMcqTimer: dbSettings.defaultMcqTimer ?? fallback.defaultMcqTimer ?? 60,
        defaultWrittenTimer: dbSettings.defaultWrittenTimer ?? fallback.defaultWrittenTimer ?? 300,
        defaultPointsPerQuestion: dbSettings.defaultPointsPerQuestion ?? fallback.defaultPointsPerQuestion ?? 1,
        halfMarkThreshold: dbSettings.halfMarkThreshold ?? fallback.halfMarkThreshold ?? 50,
        randomizeQuestions: dbSettings.randomizeQuestions ?? fallback.randomizeQuestions ?? false,
        randomizeOptions: dbSettings.randomizeOptions ?? fallback.randomizeOptions ?? true,
        showCorrectAnswers: dbSettings.showCorrectAnswers ?? fallback.showCorrectAnswers ?? true,
        showExplanations: dbSettings.showExplanations ?? fallback.showExplanations ?? true,
        displayMode: (dbSettings.displayMode as "score" | "pass_fail") ?? fallback.displayMode ?? "score",
        passingThreshold: dbSettings.passingThreshold ?? fallback.passingThreshold ?? 50,
        disableAnimations: dbSettings.disableAnimations ?? fallback.disableAnimations ?? false,
      });
    }
  }, [settings, globalConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    haptics.heavy();
    
    try {
      await updateSettings(form);
      haptics.success();
    } catch (err) {
      console.error("Failed to update settings", err);
      haptics.error();
    }
    
    setIsSaving(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : Number(value),
    }));
  };

  if (!mounted || settings === undefined || globalConfig === undefined) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center chaos-pulse">
        <Settings2 size={48} className="mx-auto text-muted-foreground mb-4 opacity-50" />
        <p className="chaos-heading text-sm text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="border-b-2 border-foreground pb-6">
        <h1 className="chaos-display text-4xl mb-1 flex items-center gap-3">
          QUIZ SETTINGS.
        </h1>
        <p className="text-sm text-muted-foreground">
          Define defaults for all your new quizzes. Save time. Create chaos faster.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-12">
        {/* Timing Settings */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <h2 className="chaos-heading text-xl">Timing Defaults</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="chaos-card bg-card p-6">
              <label className="block mb-2 chaos-heading text-sm">
                Default MCQ Timer (seconds)
              </label>
              <input
                type="number"
                name="defaultMcqTimer"
                value={form.defaultMcqTimer}
                onChange={handleChange}
                min={5}
                max={3600}
                className="w-full bg-background border-2 border-foreground p-3 focus:outline-none focus:border-chaos transition-colors text-lg font-mono tabular-nums"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                For multiple choice and true/false.
              </p>
            </div>
          </div>
          
        </section>

        {/* Player Experience Settings */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <h2 className="chaos-heading text-xl">Display Defaults</h2>
          </div>
          
          <div className="space-y-4">
            <div className="chaos-card bg-card p-4 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setForm(f => ({ ...f, showCorrectAnswers: !f.showCorrectAnswers }))}>
              <div>
                <h3 className="chaos-heading text-sm mb-1">Show Correct Answers at End</h3>
                <p className="text-xs text-muted-foreground">
                  Display the correct answers to students on their results page.
                </p>
              </div>
              <div className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors shrink-0 ${form.showCorrectAnswers ? 'bg-chaos' : 'bg-muted'}`}>
                <div className={`w-4 h-4 rounded-full bg-background transition-transform ${form.showCorrectAnswers ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
            </div>

            <div className="chaos-card bg-card p-4 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setForm(f => ({ ...f, showExplanations: !f.showExplanations }))}>
              <div>
                <h3 className="chaos-heading text-sm mb-1">Show Explanations at End</h3>
                <p className="text-xs text-muted-foreground">
                  Show your custom question explanations alongside the correct answers.
                </p>
              </div>
              <div className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors shrink-0 ${form.showExplanations ? 'bg-chaos' : 'bg-muted'}`}>
                <div className={`w-4 h-4 rounded-full bg-background transition-transform ${form.showExplanations ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
            </div>

            <div className="chaos-card bg-card p-4 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setForm(f => ({ ...f, randomizeQuestions: !f.randomizeQuestions }))}>
              <div>
                <h3 className="chaos-heading text-sm mb-1">Randomize Question Order</h3>
                <p className="text-xs text-muted-foreground">
                  Every student gets the questions in a random sequence.
                </p>
              </div>
              <div className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors shrink-0 ${form.randomizeQuestions ? 'bg-chaos' : 'bg-muted'}`}>
                <div className={`w-4 h-4 rounded-full bg-background transition-transform ${form.randomizeQuestions ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
            </div>

            <div className="chaos-card bg-card p-4 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setForm(f => ({ ...f, randomizeOptions: !f.randomizeOptions }))}>
              <div>
                <h3 className="chaos-heading text-sm mb-1">Randomize MCQ Options</h3>
                <p className="text-xs text-muted-foreground">
                  A, B, C, D choices are scrambled for each play.
                </p>
              </div>
              <div className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors shrink-0 ${form.randomizeOptions ? 'bg-chaos' : 'bg-muted'}`}>
                <div className={`w-4 h-4 rounded-full bg-background transition-transform ${form.randomizeOptions ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
            </div>

            <div className="chaos-card bg-card p-4 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setForm(f => ({ ...f, disableAnimations: !f.disableAnimations }))}>
              <div>
                <h3 className="chaos-heading text-sm mb-1">Disable Animations</h3>
                <p className="text-xs text-muted-foreground">
                  Remove complex particle effects and transitions. Just simple CORRECT / INCORRECT.
                </p>
              </div>
              <div className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors shrink-0 ${form.disableAnimations ? 'bg-chaos' : 'bg-muted'}`}>
                <div className={`w-4 h-4 rounded-full bg-background transition-transform ${form.disableAnimations ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
            </div>
          </div>
        </section>
        {/* Action Buttons */}
        <div className="sticky bottom-4 z-10 pt-4">
          <button
            type="submit"
            disabled={isSaving}
            className="w-full chaos-card bg-foreground text-background py-5 chaos-heading text-lg hover:bg-chaos hover:text-chaos-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? "SAVING..." : "SAVE SETTINGS"}
          </button>
        </div>
      </form>
    </div>
  );
}
