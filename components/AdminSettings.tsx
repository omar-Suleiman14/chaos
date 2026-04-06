import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { haptics } from "@/lib/haptics";
import { CheckCircle2, Server, Save } from "lucide-react";

export default function AdminSettings({ globalConfig }: { globalConfig: any }) {
  const updateGlobalConfig = useMutation(api.quizFunctions.updateGlobalConfig);

  const [aiLimitPopupText, setAiLimitPopupText] = useState("");
  const [playerLimitErrorText, setPlayerLimitErrorText] = useState("");
  const [defaultMcqTimer, setDefaultMcqTimer] = useState(60);
  const [defaultWrittenTimer, setDefaultWrittenTimer] = useState(300);
  const [defaultPointsPerQuestion, setDefaultPointsPerQuestion] = useState(10);
  const [halfMarkThreshold, setHalfMarkThreshold] = useState(50);
  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const [randomizeOptions, setRandomizeOptions] = useState(false);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(true);
  const [showExplanations, setShowExplanations] = useState(true);
  const [displayMode, setDisplayMode] = useState<"score" | "pass_fail">("score");
  const [passingThreshold, setPassingThreshold] = useState(50);
  const [disableAnimations, setDisableAnimations] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (globalConfig) {
      setAiLimitPopupText(
        globalConfig.aiLimitPopupText ||
          "Monthly AI Quota Reached (5/5).\n\nPlease contact our team at support@chaos.fail to upgrade your account, unlock unlimited AI generations, and elevate your quizzes."
      );
      setPlayerLimitErrorText(
        globalConfig.playerLimitErrorText ||
          "This quiz has reached its maximum allocated session capacity. Please contact the quiz creator to allocate additional capacity."
      );
      setDefaultMcqTimer(globalConfig.defaultMcqTimer ?? 60);
      setDefaultWrittenTimer(globalConfig.defaultWrittenTimer ?? 300);
      setDefaultPointsPerQuestion(globalConfig.defaultPointsPerQuestion ?? 10);
      setHalfMarkThreshold(globalConfig.halfMarkThreshold ?? 50);
      setRandomizeQuestions(globalConfig.randomizeQuestions ?? false);
      setRandomizeOptions(globalConfig.randomizeOptions ?? false);
      setShowCorrectAnswers(globalConfig.showCorrectAnswers ?? true);
      setShowExplanations(globalConfig.showExplanations ?? true);
      setDisplayMode((globalConfig.displayMode as "score" | "pass_fail") ?? "score");
      setPassingThreshold(globalConfig.passingThreshold ?? 50);
      setDisableAnimations(globalConfig.disableAnimations ?? false);
    }
  }, [globalConfig]);

  const handleSave = async () => {
    haptics.heavy();
    setSaving(true);
    await updateGlobalConfig({
      aiLimitPopupText,
      playerLimitErrorText,
      defaultMcqTimer,
      defaultWrittenTimer,
      defaultPointsPerQuestion,
      halfMarkThreshold,
      randomizeQuestions,
      randomizeOptions,
      showCorrectAnswers,
      showExplanations,
      displayMode,
      passingThreshold,
      disableAnimations,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Popups & Messages */}
      <div className="chaos-card bg-card p-6 border-foreground">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b-2 border-foreground/10">
          <Server className="text-primary" size={24} />
          <h2 className="chaos-heading text-xl">Dynamic Popups & Errors</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* AI Limit Popup */}
          <div className="space-y-3">
            <label className="chaos-heading text-sm text-muted-foreground block">
              AI LIMIT POPUP TEXT (NON-ELEVATED USERS)
            </label>
            <textarea
              className="w-full bg-background border-2 border-foreground p-3 focus:outline-none focus:border-primary text-sm min-h-[140px] resize-none"
              value={aiLimitPopupText}
              onChange={(e) => setAiLimitPopupText(e.target.value)}
            />
            <div className="p-4 bg-muted/30 border border-foreground/20 rounded-md">
              <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wider">Preview (Window Alert)</p>
              <div className="bg-white border shadow-xl max-w-sm rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2 border-b flex items-center justify-between">
                  <span className="text-xs font-semibold">chaos.fail says</span>
                  <div className="w-12 h-3 bg-gray-300 rounded-full"></div>
                </div>
                <div className="p-4 bg-white text-sm whitespace-pre-wrap">{aiLimitPopupText}</div>
                <div className="p-3 border-t bg-gray-50 flex justify-end">
                  <button className="px-4 py-1.5 bg-blue-500 text-white text-sm font-semibold rounded">OK</button>
                </div>
              </div>
            </div>
          </div>

          {/* Player Limit Error */}
          <div className="space-y-3">
            <label className="chaos-heading text-sm text-muted-foreground block">
              QUIZ PLAYER CAPACITY ERROR (100-PLAY CAP)
            </label>
            <textarea
              className="w-full bg-background border-2 border-foreground p-3 focus:outline-none focus:border-primary text-sm min-h-[140px] resize-none"
              value={playerLimitErrorText}
              onChange={(e) => setPlayerLimitErrorText(e.target.value)}
            />
            <div className="p-4 bg-muted/30 border border-foreground/20 rounded-md">
              <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wider">Preview (Quiz Player)</p>
              <div className="p-4 border-2 border-destructive bg-destructive/10 text-destructive text-sm font-semibold max-w-sm">
                Error: {playerLimitErrorText}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Global Defaults */}
      <div className="chaos-card bg-card p-6 border-foreground">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b-2 border-foreground/10">
          <Server className="text-primary" size={24} />
          <h2 className="chaos-heading text-xl">Global Website Defaults</h2>
          <p className="text-xs text-muted-foreground mt-1 ml-auto">These apply if a user hasn't set custom defaults.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-5">
            <div>
              <label className="chaos-heading text-xs text-muted-foreground mb-1 block">DEFAULT MCQ TIMER (SEC)</label>
              <input type="number" min={5} max={300} value={defaultMcqTimer} onChange={(e) => setDefaultMcqTimer(parseInt(e.target.value) || 5)} className="w-full bg-background border-2 border-foreground p-2" />
            </div>
            <div>
              <label className="chaos-heading text-xs text-muted-foreground mb-1 block">DEFAULT WRITTEN TIMER (SEC)</label>
              <input type="number" min={15} max={600} value={defaultWrittenTimer} onChange={(e) => setDefaultWrittenTimer(parseInt(e.target.value) || 15)} className="w-full bg-background border-2 border-foreground p-2" />
            </div>
            <div>
              <label className="chaos-heading text-xs text-muted-foreground mb-1 block">DEFAULT MARKS PER QUESTION</label>
              <input type="number" min={0} max={100} value={defaultPointsPerQuestion} onChange={(e) => setDefaultPointsPerQuestion(parseInt(e.target.value) || 0)} className="w-full bg-background border-2 border-foreground p-2" />
            </div>
            <div>
              <label className="chaos-heading text-xs text-muted-foreground mb-1 block">HALF-MARK THRESHOLD (%)</label>
              <input type="number" min={1} max={99} value={halfMarkThreshold} onChange={(e) => setHalfMarkThreshold(parseInt(e.target.value) || 1)} className="w-full bg-background border-2 border-foreground p-2" />
            </div>
          </div>

          <div className="space-y-6">
            {[
              { label: "Randomize Question Order", val: randomizeQuestions, set: setRandomizeQuestions },
              { label: "Randomize MCQ Options", val: randomizeOptions, set: setRandomizeOptions },
              { label: "Show Correct Answers", val: showCorrectAnswers, set: setShowCorrectAnswers },
              { label: "Show Explanations", val: showExplanations, set: setShowExplanations },
              { label: "Disable Animations Globally", val: disableAnimations, set: setDisableAnimations },
            ].map(({ label, val, set }) => (
              <label key={label} className="flex items-center justify-between cursor-pointer group">
                <span className="font-bold text-sm group-hover:text-primary transition-colors">{label}</span>
                <div className={`w-12 h-6 border-2 transition-colors relative ${val ? "bg-primary border-primary" : "bg-transparent border-foreground/40"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 transition-all ${val ? "bg-background left-6" : "bg-foreground/40 left-1"}`} />
                </div>
                <input type="checkbox" className="hidden" checked={val} onChange={(e) => set(e.target.checked)} />
              </label>
            ))}
          </div>
        </div>

        {/* Score Display Mode */}
        <div className="pt-4 border-t border-foreground/10">
          <h3 className="chaos-heading text-sm mb-4">Result Display Mode</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div className="space-y-3">
              <label className="chaos-heading text-xs text-muted-foreground block">DEFAULT DISPLAY MODE</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setDisplayMode("score")}
                  className={`flex-1 py-2 chaos-heading text-xs border-2 transition-colors ${
                    displayMode === "score"
                      ? "bg-foreground text-background border-foreground"
                      : "bg-transparent border-foreground/30 text-muted-foreground hover:border-foreground"
                  }`}
                >
                  Show Score
                </button>
                <button
                  onClick={() => setDisplayMode("pass_fail")}
                  className={`flex-1 py-2 chaos-heading text-xs border-2 transition-colors ${
                    displayMode === "pass_fail"
                      ? "bg-foreground text-background border-foreground"
                      : "bg-transparent border-foreground/30 text-muted-foreground hover:border-foreground"
                  }`}
                >
                  Pass / Fail
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="chaos-heading text-xs text-muted-foreground">PASSING THRESHOLD</label>
                <span className="chaos-heading text-sm font-bold">{passingThreshold}%</span>
              </div>
              <input
                type="range" min={0} max={100} step={5}
                value={passingThreshold}
                onChange={e => setPassingThreshold(parseInt(e.target.value))}
                className="w-full accent-foreground"
              />
              <div className="flex justify-between chaos-heading text-[9px] text-muted-foreground">
                <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Players scoring at or above this threshold will see <strong>PASSED</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="kb-btn kb-btn-primary flex items-center gap-2 group min-w-[200px] justify-center"
        >
          {saving ? (
            "SAVING..."
          ) : saved ? (
            <><CheckCircle2 size={18} /> SAVED</>
          ) : (
            <> SAVE SETTINGS</>
          )}
        </button>
      </div>
    </div>
  );
}
