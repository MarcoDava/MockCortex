import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useMutation } from "convex/react";
import { API_BASE } from "@/lib/api";
import { convexAddInterview, convexTouchSession } from "@/lib/convexFunctions";
import { getVideoBlob } from "@/lib/videoStore";
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
  const touchSession = useMutation(convexTouchSession);

  const runNeuralAnalysisFor = async (sessions: SessionResult[]) => {
    const transcripts = sessions.map((s) => s.answer).filter(Boolean);
    if (transcripts.length === 0) { setNeuralState("pending"); return; }
    try {
      const res = await fetch(`${API_BASE}/api/neural-engagement`, {
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
      const character = (() => {
        try {
          return JSON.parse(localStorage.getItem("selectedCharacter") ?? "null") as { name?: string } | null;
        } catch { return null; }
      })();

      try {
        const resumeSummary = (() => {
          try {
            const raw = localStorage.getItem("resumeSummary");
            return raw ? JSON.parse(raw) : undefined;
          } catch { return undefined; }
        })();
        const res = await fetch(`${API_BASE}/api/get-feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionData, voiceId, resumeSummary }),
        });
        if (!res.ok) throw new Error("Feedback request failed");
        const data = (await res.json()) as { feedback: Feedback[] };
        const fb = data.feedback ?? [];
        setFeedbacks(fb);
        setVideoUrls(sessionData.map((_, i) => getVideoBlob(i)));

        const avgScore =
          fb.length > 0
            ? Math.round(fb.reduce((sum, f) => sum + f.score, 0) / fb.length)
            : 0;

        const entry = {
          sessionId: localStorage.getItem("mockcortex_session_id") ?? "",
          date: new Date().toLocaleString(),
          jobTitle: "Interview Session",
          avgScore,
          lastAccessedAt: Date.now(),
          feedback: fb,
          answers: sessionData,
          questions: sessionData.map((s) => s.question),
          interviewerName: character?.name,
        };

        // Persist to Convex (primary) with localStorage fallback
        try {
          await addInterview(entry);
          await touchSession({ sessionId: entry.sessionId });
        } catch {
          // Convex not configured — fall back to localStorage
          const history: unknown[] = JSON.parse(
            localStorage.getItem("interviewHistory") ?? "[]"
          );
          localStorage.setItem(
            "interviewHistory",
            JSON.stringify([entry, ...history])
          );
        }

        // Auto-trigger neural analysis after feedback is saved
        void runNeuralAnalysisFor(sessionData);
      } catch {
        setFeedbacks([]);
        setNeuralState("pending");
      } finally {
        setIsLoading(false);
      }
    };
    loadFeedback();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const speakFeedback = async (text: string) => {
    const voiceId = localStorage.getItem("selectedVoiceId") ?? "";
    try {
      const res = await fetch(`${API_BASE}/api/ask-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, voiceId }),
      });
      if (!res.ok) return;
      const audio = new Audio(URL.createObjectURL(await res.blob()));
      audio.play();
    } catch { /* non-fatal */ }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-5 text-white">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-white/8" />
          <div className="absolute inset-0 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-white font-medium text-sm">Analysing your answers</p>
          <p className="text-gray-500 text-xs">Gemini is reviewing each response…</p>
        </div>
      </div>
    );
  }

  const avgScore =
    feedbacks.length > 0
      ? Math.round(feedbacks.reduce((sum, f) => sum + f.score, 0) / feedbacks.length)
      : 0;

  return (
    <div className="min-h-screen p-6 pointer-events-auto">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-4 mb-10">
          <h1 className="text-3xl font-bold text-white">Interview Feedback</h1>
          {feedbacks.length > 0 && (
            <div className="flex flex-col items-center gap-2">
              <div className="relative w-20 h-20">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                  <circle
                    cx="40" cy="40" r="34" fill="none"
                    stroke={scoreRingColor(avgScore)}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - avgScore / 10)}`}
                    style={{ transition: "stroke-dashoffset 1.2s ease-out 0.4s" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-black text-white tabular-nums">{avgScore}</span>
                </div>
              </div>
              <p className="text-gray-500 text-xs uppercase tracking-widest">Overall Score</p>
            </div>
          )}
        </div>

        {feedbacks.length === 0 ? (
          <p className="text-center text-gray-500">No feedback available.</p>
        ) : (
          feedbacks.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1, ease: "easeOut" }}
            >
              <FeedbackCard
                index={i}
                feedback={f}
                question={sessionResults[i]?.question}
                emotionTimeline={sessionResults[i]?.emotionTimeline}
                videoUrl={videoUrls[i]}
                onSpeakFeedback={speakFeedback}
                neuralResult={neuralState === "done" ? neuralResults?.[i] : undefined}
              />
            </motion.div>
          ))
        )}

        {/* Neural analysis */}
        {feedbacks.length > 0 && (
          <div className="rounded-xl border border-purple-800 bg-purple-950/30 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🧠</span>
              <div>
                <h2 className="text-white font-semibold">Neural Brain Analysis</h2>
                <p className="text-purple-300 text-xs">
                  Powered by Meta TRIBE v2 · Predicts listener brain activation from your answers
                </p>
              </div>
            </div>
            {neuralState === "loading" && (
              <div className="flex items-center gap-3 text-purple-300">
                <span className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Running brain analysis…</span>
              </div>
            )}
            {neuralState === "pending" && (
              <p className="text-sm text-purple-300/70">
                Brain analysis pending — TRIBE v2 not connected.{" "}
                <span className="text-gray-500">
                  Set <code className="text-purple-400">BRAIN_SERVICE_URL</code> in your backend to activate neural scoring.
                </span>
              </p>
            )}
            {neuralState === "done" && (
              <div className="space-y-2">
                <p className="text-sm text-green-400">✓ Neural analysis complete — brain maps shown above.</p>
                {neuralInterpretation && (
                  <p className="text-sm text-purple-100 bg-purple-900/30 border border-purple-800/50 rounded-lg px-3 py-2">
                    {neuralInterpretation}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-center pt-4">
          <Link
            to="/characters"
            className="bg-violet-600 text-white px-8 py-3 rounded-2xl font-semibold hover:bg-violet-500 transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.35)]"
          >
            Start New Interview
          </Link>
        </div>
      </div>
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
  confident: "😊",
  focused: "🧠",
  stressed: "😰",
  surprised: "😮",
  neutral: "😐",
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

  // Summarise emotions from timeline
  const emotionCounts = emotionTimeline?.reduce<Record<string, number>>((acc, s) => {
    acc[s.emotion] = (acc[s.emotion] ?? 0) + 1;
    return acc;
  }, {});
  const dominantEmotions = emotionCounts
    ? Object.entries(emotionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([e]) => e)
    : [];

  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_4px_24px_rgba(0,0,0,0.3)]">
      {videoUrl ? (
        <div className="flex flex-col md:flex-row">
          {/* Video panel */}
          <div className="md:w-1/2 bg-black flex items-center justify-center">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              className="w-full max-h-72 object-contain"
            />
          </div>

          {/* Critique panel */}
          <div className="md:w-1/2 p-5 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              {question && (
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Q{index + 1}: {question}
                </p>
              )}
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${scoreBadgeClass(feedback.score)}`}>
                {feedback.score}/10
              </span>
              <p className="text-gray-200 leading-relaxed text-sm">{feedback.critique}</p>
            </div>

            <div className="space-y-2">
              {dominantEmotions.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {dominantEmotions.map((e) => (
                    <span key={e} className="text-xs bg-gray-800 border border-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                      {EMOTION_EMOJI[e] ?? "❓"} {e}
                    </span>
                  ))}
                </div>
              )}
              <button
                onClick={() => onSpeakFeedback(feedback.critique)}
                className="text-blue-400 text-sm hover:text-blue-300 transition-colors underline underline-offset-2"
              >
                Hear Feedback
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* No video — single-column layout */
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
                {dominantEmotions.map((e) => (
                  <span key={e} className="text-xs bg-white/5 border border-white/10 text-gray-400 px-2.5 py-1 rounded-full">
                    {EMOTION_EMOJI[e] ?? "•"} {e}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => onSpeakFeedback(feedback.critique)}
              className="text-xs text-violet-400 hover:text-violet-300 font-medium flex items-center gap-1.5 transition-colors"
            >
              <span className="w-3.5 h-3.5 rounded-full border border-violet-400/60 flex items-center justify-center text-[8px]">▶</span>
              Hear feedback
            </button>
          </div>
        </div>
      )}

      {neuralResult && <NeuralPanel result={neuralResult} index={index} />}
    </div>
  );
};

interface NeuralPanelProps { result: NeuralResult; index: number; }
const NeuralPanel = ({ result, index }: NeuralPanelProps) => (
  <div className="mt-4 border-t border-purple-900/50 pt-4 space-y-3">
    <div className="flex items-center gap-2">
      <span className="text-purple-400 text-xs font-semibold uppercase tracking-wide">
        🧠 Neural Engagement — Q{index + 1}
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
        {result.regions.map((r) => (
          <span key={r.name} className="text-xs bg-purple-900/50 border border-purple-800 text-purple-200 px-2 py-0.5 rounded-full">
            {r.name}
          </span>
        ))}
      </div>
    </div>
  </div>
);

export default FeedbackPage;
