import { useState, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { haptics } from "@/lib/haptics";
import { CheckCircle2, Server } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import type { FunctionReturnType } from "convex/server";
import { errorMessage } from "@/lib/errors";

const copy = {
  en: {
    popups: "Dynamic Popups & Errors", capacity: "Quiz player capacity error (100-play cap)", preview: "Preview (Quiz Player)", errorPrefix: "Error",
    responsesPerForm: "Responses per form (non-elevated owners)",
    responsesNote: "A form stops accepting responses at this limit and tells respondents it is full; nothing is discarded. Owners are notified at 80% and 100%. Elevated owners have no platform limit.",
    defaults: "Global Website Defaults", defaultsNote: "These apply if a user hasn't set custom defaults.",
    mcqTimer: "Default MCQ timer (sec)", writtenTimer: "Default written timer (sec)", marksPerQ: "Default marks per question", halfMark: "Half-mark threshold (%)",
    randQ: "Randomize Question Order", randO: "Randomize MCQ Options", showCorrect: "Show Correct Answers", showExpl: "Show Explanations", disableAnim: "Disable Animations Globally",
    displayHeading: "Result Display Mode", displayMode: "Default display mode", showScore: "Show Score", passFail: "Pass / Fail", passing: "Passing threshold",
    passingBefore: "Players scoring at or above this threshold will see ", passingAfter: ".", passed: "Passed",
    saving: "Saving...", saved: "Saved", save: "Save settings", saveFailed: "Settings could not be saved. Please try again.",
    defaultError: "This quiz has reached its maximum allocated session capacity. Please contact the quiz creator to allocate additional capacity.",
  },
  ar: {
    popups: "النوافذ والأخطاء الديناميكية", capacity: "خطأ اكتمال سعة اللاعبين (حد 100 لعبة)", preview: "معاينة (مشغّل الاختبار)", errorPrefix: "خطأ",
    responsesPerForm: "الردود لكل نموذج (المالكون العاديون)",
    responsesNote: "يتوقف النموذج عن استقبال الردود عند هذا الحد ويخبر المجيبين أنه ممتلئ، ولا يُحذف شيء. يصل المالكين إشعار عند 80% وعند 100%. المالكون المميزون بلا حد على المنصة.",
    defaults: "الإعدادات الافتراضية للموقع", defaultsNote: "تُطبَّق إذا لم يضبط المستخدم إعدادات افتراضية خاصة به.",
    mcqTimer: "مؤقت الاختيار من متعدد الافتراضي (ثانية)", writtenTimer: "مؤقت السؤال المكتوب الافتراضي (ثانية)", marksPerQ: "النقاط الافتراضية لكل سؤال", halfMark: "حد نصف النقطة (%)",
    randQ: "ترتيب الأسئلة عشوائيًا", randO: "ترتيب خيارات الاختيار من متعدد عشوائيًا", showCorrect: "إظهار الإجابات الصحيحة", showExpl: "إظهار الشروح", disableAnim: "تعطيل الحركة في كل الموقع",
    displayHeading: "طريقة عرض النتيجة", displayMode: "طريقة العرض الافتراضية", showScore: "اعرض الدرجة", passFail: "ناجح / راسب", passing: "حد النجاح",
    passingBefore: "اللاعبون الذين تبلغ درجتهم هذا الحد أو أكثر سيرون ", passingAfter: ".", passed: "ناجح",
    saving: "جارٍ الحفظ...", saved: "تم الحفظ", save: "احفظ الإعدادات", saveFailed: "تعذّر حفظ الإعدادات. حاول مرة أخرى.",
    defaultError: "بلغ هذا الاختبار الحد الأقصى من سعة الجلسات المخصصة. تواصل مع منشئ الاختبار لزيادة السعة.",
  },
};

export default function AdminSettings({ globalConfig }: { globalConfig: Partial<NonNullable<FunctionReturnType<typeof api.quizFunctions.getGlobalConfig>>> | null | undefined }) {
  const t = useCopy(copy);
  const updateGlobalConfig = useMutation(api.quizFunctions.updateGlobalConfig);

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
  const [formResponseLimit, setFormResponseLimit] = useState(1000);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(confirmationTimer.current), []);

  useEffect(() => {
    if (globalConfig) {
      setPlayerLimitErrorText(
        globalConfig.playerLimitErrorText ||
          t.defaultError
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
      setFormResponseLimit(globalConfig.formResponseLimit ?? 1000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalConfig]);

  const handleSave = async () => {
    haptics.heavy();
    setSaving(true);
    clearTimeout(confirmationTimer.current);
    setSaved(false);
    setSaveError("");
    try {
      await updateGlobalConfig({
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
        formResponseLimit: Math.max(1, Math.round(formResponseLimit) || 1),
      });
      setSaved(true);
      confirmationTimer.current = setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setSaveError(errorMessage(error, t.saveFailed));
      haptics.error();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Popups & Messages */}
      <div className="chaos-card bg-card p-6 border-foreground">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b-2 border-foreground/10">
          <Server className="text-primary" size={24} />
          <h2 className="chaos-heading text-xl">{t.popups}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Player Limit Error */}
          <div className="space-y-3">
            <label className="chaos-heading text-sm text-muted-foreground block">
              {t.capacity}
            </label>
            <textarea
              className="w-full bg-background border-2 border-foreground p-3 focus:outline-none focus:border-primary text-sm min-h-[140px] resize-none"
              value={playerLimitErrorText}
              onChange={(e) => setPlayerLimitErrorText(e.target.value)}
            />
            <div className="p-4 bg-muted/30 border border-foreground/20 rounded-md">
              <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wider">{t.preview}</p>
              <div className="p-4 border-2 border-destructive bg-destructive/10 text-destructive text-sm font-semibold max-w-sm">
                {t.errorPrefix}: {playerLimitErrorText}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <label htmlFor="form-response-limit" className="chaos-heading text-sm text-muted-foreground block">
              {t.responsesPerForm}
            </label>
            <input id="form-response-limit" type="number" min={1} value={formResponseLimit} onChange={(e) => setFormResponseLimit(parseInt(e.target.value) || 1)} className="w-full bg-background border-2 border-foreground p-2" />
            <p className="text-xs text-muted-foreground">
              {t.responsesNote}
            </p>
          </div>
        </div>
      </div>

      {/* Global Defaults */}
      <div className="chaos-card bg-card p-6 border-foreground">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b-2 border-foreground/10">
          <Server className="text-primary" size={24} />
          <h2 className="chaos-heading text-xl">{t.defaults}</h2>
          <p className="text-xs text-muted-foreground mt-1 ms-auto">{t.defaultsNote}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-5">
            <div>
              <label className="chaos-heading text-xs text-muted-foreground mb-1 block">{t.mcqTimer}</label>
              <input type="number" min={5} max={300} value={defaultMcqTimer} onChange={(e) => setDefaultMcqTimer(parseInt(e.target.value) || 5)} className="w-full bg-background border-2 border-foreground p-2" />
            </div>
            <div>
              <label className="chaos-heading text-xs text-muted-foreground mb-1 block">{t.writtenTimer}</label>
              <input type="number" min={15} max={600} value={defaultWrittenTimer} onChange={(e) => setDefaultWrittenTimer(parseInt(e.target.value) || 15)} className="w-full bg-background border-2 border-foreground p-2" />
            </div>
            <div>
              <label className="chaos-heading text-xs text-muted-foreground mb-1 block">{t.marksPerQ}</label>
              <input type="number" min={0} max={100} value={defaultPointsPerQuestion} onChange={(e) => setDefaultPointsPerQuestion(parseInt(e.target.value) || 0)} className="w-full bg-background border-2 border-foreground p-2" />
            </div>
            <div>
              <label className="chaos-heading text-xs text-muted-foreground mb-1 block">{t.halfMark}</label>
              <input type="number" min={1} max={99} value={halfMarkThreshold} onChange={(e) => setHalfMarkThreshold(parseInt(e.target.value) || 1)} className="w-full bg-background border-2 border-foreground p-2" />
            </div>
          </div>

          <div className="space-y-6">
            {[
              { label: t.randQ, val: randomizeQuestions, set: setRandomizeQuestions },
              { label: t.randO, val: randomizeOptions, set: setRandomizeOptions },
              { label: t.showCorrect, val: showCorrectAnswers, set: setShowCorrectAnswers },
              { label: t.showExpl, val: showExplanations, set: setShowExplanations },
              { label: t.disableAnim, val: disableAnimations, set: setDisableAnimations },
            ].map(({ label, val, set }) => (
              <label key={label} className="flex items-center justify-between cursor-pointer group">
                <span className="font-bold text-sm group-hover:text-primary transition-colors">{label}</span>
                <div className={`w-12 h-6 border-2 transition-colors relative ${val ? "bg-primary border-primary" : "bg-transparent border-foreground/40"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 transition-all ${val ? "bg-background start-6" : "bg-foreground/40 start-1"}`} />
                </div>
                <input type="checkbox" className="hidden" checked={val} onChange={(e) => set(e.target.checked)} />
              </label>
            ))}
          </div>
        </div>

        {/* Score Display Mode */}
        <div className="pt-4 border-t border-foreground/10">
          <h3 className="chaos-heading text-sm mb-4">{t.displayHeading}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div className="space-y-3">
              <label className="chaos-heading text-xs text-muted-foreground block">{t.displayMode}</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setDisplayMode("score")}
                  className={`flex-1 py-2 chaos-heading text-xs border-2 transition-colors ${
                    displayMode === "score"
                      ? "bg-foreground text-background border-foreground"
                      : "bg-transparent border-foreground/30 text-muted-foreground hover:border-foreground"
                  }`}
                >
                  {t.showScore}
                </button>
                <button
                  onClick={() => setDisplayMode("pass_fail")}
                  className={`flex-1 py-2 chaos-heading text-xs border-2 transition-colors ${
                    displayMode === "pass_fail"
                      ? "bg-foreground text-background border-foreground"
                      : "bg-transparent border-foreground/30 text-muted-foreground hover:border-foreground"
                  }`}
                >
                  {t.passFail}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="chaos-heading text-xs text-muted-foreground">{t.passing}</label>
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
                {t.passingBefore}<strong>{t.passed}</strong>{t.passingAfter}
              </p>
            </div>
          </div>
        </div>
      </div>

      {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="kb-btn kb-btn-primary flex items-center gap-2 group min-w-[200px] justify-center"
        >
          {saving ? (
            t.saving
          ) : saved ? (
            <><CheckCircle2 size={18} /> {t.saved}</>
          ) : (
            <> {t.save}</>
          )}
        </button>
      </div>
    </div>
  );
}
