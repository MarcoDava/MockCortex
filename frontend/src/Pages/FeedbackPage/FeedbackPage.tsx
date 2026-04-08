import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useMutation } from "convex/react";
import { apiFetch } from "@/lib/api";
import { convexAddInterview } from "@/lib/convexFunctions";
import { getVideoBlob, clearVideoStore } from "@/lib/videoStore";
import { parseLocalStorageJson } from "@/lib/utils";
import type { Feedback, NeuralEngagementResponse, NeuralResult, SessionResult } from "@/types";

const scoreBadgeClass = (score: number) => {
  if (score >= 8) return "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300";
  if (score >= 6) return "bg-green-500/12 border border-green-500/25 text-green-400";
  if (score >= 4) return "bg-amber-500/12 border border-amber-500/25 text-amber-300";
  return "bg-red-500/12 border border-red-500/25 text-red-400";
};

const scoreRingColor = (score: number) => {
  if (score >= 7) return "rgb(52,211,153)";
  if (score >= 4) return "rgb(251,191,36)";
  return "rgb(248,113,113)";
};

const neuralBadgeClass = (score: number) => {
  if (score >= 70) return "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300";
  if (score >= 40) return "bg-amber-500/12 border border-amber-500/25 text-amber-300";
  return "bg-red-500/12 border border-red-500/25 text-red-400";
};

type NeuralState = "loading" | "done" | "pending";

const FeedbackPage = () => {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [sessionResults, setSessionResults] = useState<SessionResult[]>([]);
  const [videoUrls, setVideoUrls] = useState<(string | undefined)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [neuralState, setNeuralState] = useState<NeuralState>("loading");
  const [neuralResults, setNeuralResults] = useState<NeuralResult[] | null>(null);
  const [neuralInterpretation, setNeuralInterpretation] = useState<string>("");
  const addInterview = useMutation(convexAddInterview);

  useEffect(() => {
    return () => { clearVideoStore(); };
  }, []);

  const runNeuralAnalysisFor = async (sessions: SessionResult[]) => {
    const transcripts = sessions.map((s) => s.answer).filter(Boolean);
    if (transcripts.length === 0) {
      setNeuralState("pending");
      return;
    }
    try {
      const res = await apiFetch(`/api/neural-engagement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcripts }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as NeuralEngagementResponse;
      if (!data.available || !data.results) {
        setNeuralState("pending");
        return;
      }
      setNeuralResults(data.results);
      setNeuralInterpretation(data.interpretation ?? "");
      setNeuralState("done");
    } catch {
      setNeuralState("pending");
    }
  };

  useEffect(() => {
    const loadFeedback = async () => {
      const sessionData: SessionResult[] = JSON.parse(
        localStorage.getItem("sessionResults") ?? "[]"
      );
      setSessionResults(sessionData);
      const voiceId = localStorage.getItem("selectedVoiceId") ?? "";
      const character = parseLocalStorageJson<{ name?: string }>("selectedCharacter");

      try {
        const resumeSummary = parseLocalStorageJson("resumeSummary") ?? undefined;
        const res = await apiFetch(`/api/get-feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionData, voiceId, resumeSummary }),
        });
        if (!res.ok) throw new Error("Feedback request failed");
        const data = (await res.json()) as { feedback: Feedback[] };
        const fb = data.feedback ?? [];
        setFeedbacks(fb);
        setVideoUrls(sessionData.map((_, i) => getVideoBlob(i)));

        const entry = {
          date: new Date().toLocaleString(),
          jobTitle: "Interview Session",
          avgScore: fb.length > 0 ? Math.round(fb.reduce((sum, item) => sum + item.score, 0) / fb.length) : 0,
          lastAccessedAt: Date.now(),
          feedback: fb,
          answers: sessionData,
          questions: sessionData.map((item) => item.question),
          interviewerName: character?.name,
        };
        await addInterview(entry);

        void runNeuralAnalysisFor(sessionData);
      } catch {
        setFeedbacks([]);
        setNeuralState("pending");
      } finally {
        setIsLoading(false);
      }
    };

    void loadFeedback();
  }, []);

  const speakFeedback = async (text: string) => {
    const voiceId = localStorage.getItem("selectedVoiceId") ?? "";
    try {
      const res = await apiFetch(`/api/ask-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, voiceId }),
      });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play();
    } catch {
      // Non-fatal
    }
  };

  if (isLoading) {
    return (
      <div className="pointer-events-auto flex min-h-[60vh] items-center justify-center">
        <div className="surface-panel flex items-center gap-4 px-6 py-5">
          <div className="h-8 w-8 rounded-full border-2 border-[rgba(201,98,49,0.2)] border-t-[rgb(182,86,41)] animate-spin" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">Analysing your answers</p>
            <p className="text-sm text-slate-600">Gemini is reviewing each response.</p>
          </div>
        </div>
      </div>
    );
  }

  const avgScore =
    feedbacks.length > 0
      ? Math.round(feedbacks.reduce((sum, item) => sum + item.score, 0) / feedbacks.length)
      : 0;

  return (
    <div className="page-stack pointer-events-auto">
      <section className="surface-panel-strong p-6 sm:p-8">
        <div className="text-center space-y-4">
          <span className="eyebrow">Feedback review</span>
          <h1 className="section-title text-slate-950">Review the session like a coach, not a spectator.</h1>
          <p className="body-muted mx-auto max-w-2xl">
            Use the score, critique, and optional neural analysis to decide what to sharpen before the next run.
          </p>
          {feedbacks.length > 0 && (
            <div className="flex flex-col items-center gap-2">
              <div className="relative w-20 h-20">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke={scoreRingColor(avgScore)}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - avgScore / 10)}`}
                    style={{ transition: "stroke-dashoffset 1.2s ease-out 0.4s" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-black text-slate-950 tabular-nums">{avgScore}</span>
                </div>
              </div>
              <p className="text-xs uppercase tracking-[0.26em] text-slate-500">Overall score</p>
            </div>
          )}
        </div>
        {feedbacks.length === 0 ? (
          <p className="mt-6 text-center text-slate-500">No feedback available.</p>
        ) : (
          <div className="mt-8 grid gap-5">
            {feedbacks.map((feedback, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1, ease: "easeOut" }}
              >
                <FeedbackCard
                  index={index}
                  feedback={feedback}
                  question={sessionResults[index]?.question}
                  emotionTimeline={sessionResults[index]?.emotionTimeline}
                  videoUrl={videoUrls[index]}
                  onSpeakFeedback={speakFeedback}
                  neuralResult={neuralState === "done" ? neuralResults?.[index] : undefined}
                />
              </motion.div>
            ))}
          </div>
        )}

        {feedbacks.length > 0 && (
          <div className="mt-8 ink-panel p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-[rgba(235,205,181,0.72)]">
                Neural layer
              </span>
              <div>
                <h2 className="text-white font-semibold">Neural Brain Analysis</h2>
                <p className="text-slate-300 text-xs">
                  Powered by Meta TRIBE v2. Predicts listener brain activation from your answers.
                </p>
              </div>
            </div>
            {neuralState === "loading" && (
              <div className="flex items-center gap-3 text-slate-300">
                <span className="w-5 h-5 border-2 border-[rgba(235,205,181,0.35)] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Running brain analysis...</span>
              </div>
            )}
            {neuralState === "pending" && (
              <p className="text-sm text-slate-300/80">
                Brain analysis pending.
                <span className="text-slate-400"> Connect the brain service to activate neural scoring.</span>
              </p>
            )}
            {neuralState === "done" && (
              <div className="space-y-2">
                <p className="text-sm text-green-400">Neural analysis complete. Brain maps are shown above.</p>
                {neuralInterpretation && (
                  <p className="rounded-[20px] border border-white/10 bg-white/6 px-4 py-3 text-sm text-slate-100">
                    {neuralInterpretation}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-center pt-4">
          <Link to="/characters" className="primary-button">
            Start New Interview
          </Link>
        </div>
      </section>
    </div>
  );
};

interface FeedbackCardProps {
  index: number;
  feedback: Feedback;
  question?: string;
  emotionTimeline?: { ts: number; emotion: string; confidence: number }[];
  videoUrl?: string;
  onSpeakFeedback: (text: string) => void;
  neuralResult?: NeuralResult;
}

const EMOTION_EMOJI: Record<string, string> = {
  confident: ":)",
  focused: "[]",
  stressed: ":(",
  surprised: ":O",
  neutral: ":|",
};

const FeedbackCard = ({
  index,
  feedback,
  question,
  emotionTimeline,
  videoUrl,
  onSpeakFeedback,
  neuralResult,
}: FeedbackCardProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const emotionCounts = emotionTimeline?.reduce<Record<string, number>>((acc, sample) => {
    acc[sample.emotion] = (acc[sample.emotion] ?? 0) + 1;
    return acc;
  }, {});
  const dominantEmotions = emotionCounts
    ? Object.entries(emotionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([emotion]) => emotion)
    : [];

  return (
    <div className="surface-panel overflow-hidden">
      {videoUrl ? (
        <div className="flex flex-col md:flex-row">
          <div className="md:w-1/2 bg-[rgb(18,29,40)] flex items-center justify-center">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              className="w-full max-h-72 object-contain"
            />
          </div>

          <div className="md:w-1/2 p-5 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              {question && (
                <p className="text-xs uppercase tracking-[0.24em] text-[rgb(154,77,37)]">
                  Q{index + 1}: {question}
                </p>
              )}
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${scoreBadgeClass(feedback.score)}`}>
                {feedback.score}/10
              </span>
              <p className="text-sm leading-7 text-slate-700">{feedback.critique}</p>
            </div>

            <div className="space-y-2">
              {dominantEmotions.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {dominantEmotions.map((emotion) => (
                    <span key={emotion} className="text-xs bg-white/5 border border-white/10 text-gray-400 px-2.5 py-1 rounded-full">
                      {EMOTION_EMOJI[emotion] ?? "?"} {emotion}
                    </span>
                  ))}
                </div>
              )}
              <button
                onClick={() => onSpeakFeedback(feedback.critique)}
                className="text-xs text-violet-400 hover:text-violet-300 font-medium flex items-center gap-1.5 transition-colors"
              >
                <span className="w-3.5 h-3.5 rounded-full border border-violet-400/60 flex items-center justify-center text-[8px]">{">"}</span>
                Hear feedback
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5 space-y-3">
          {question && (
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
              Q{index + 1}: {question}
            </p>
          )}
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${scoreBadgeClass(feedback.score)}`}>
            {feedback.score}/10
          </span>
          <p className="text-gray-200 leading-relaxed text-sm">{feedback.critique}</p>
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            {dominantEmotions.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {dominantEmotions.map((emotion) => (
                  <span key={emotion} className="text-xs bg-white/5 border border-white/10 text-gray-400 px-2.5 py-1 rounded-full">
                    {EMOTION_EMOJI[emotion] ?? "."} {emotion}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => onSpeakFeedback(feedback.critique)}
              className="text-xs text-violet-400 hover:text-violet-300 font-medium flex items-center gap-1.5 transition-colors"
            >
              <span className="w-3.5 h-3.5 rounded-full border border-violet-400/60 flex items-center justify-center text-[8px]">{">"}</span>
              Hear feedback
            </button>
          </div>
        </div>
      )}

      {neuralResult && <NeuralPanel result={neuralResult} index={index} />}
    </div>
  );
};

interface NeuralPanelProps {
  result: NeuralResult;
  index: number;
}

const NeuralPanel = ({ result, index }: NeuralPanelProps) => (
  <div className="mt-4 border-t border-purple-900/50 pt-4 space-y-3">
    <div className="flex items-center gap-2">
      <span className="text-purple-400 text-xs font-semibold uppercase tracking-wide">
        Neural Engagement - Q{index + 1}
      </span>
      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${neuralBadgeClass(result.score)}`}>
        {result.score}/100
      </span>
    </div>
    <img
      src={`data:image/png;base64,${result.brainImageBase64}`}
      alt={`Brain activation map for answer ${index + 1}`}
      className="w-full rounded-lg border border-purple-900/40"
    />
    <div className="space-y-1">
      <p className="text-purple-400 text-xs font-medium">Top activated regions</p>
      <div className="flex flex-wrap gap-2">
        {result.regions.map((region) => (
          <span key={region.name} className="text-xs bg-purple-900/50 border border-purple-800 text-purple-200 px-2 py-0.5 rounded-full">
            {region.name}
          </span>
        ))}
      </div>
    </div>
  </div>
);

export default FeedbackPage;
