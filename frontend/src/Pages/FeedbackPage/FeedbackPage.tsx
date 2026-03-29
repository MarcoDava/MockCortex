import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "convex/react";
import { API_BASE } from "@/lib/api";
import { convexAddInterview } from "@/lib/convexFunctions";
import type { Feedback, SessionResult, NeuralResult } from "@/types";

const scoreBadgeClass = (score: number) => {
  if (score >= 7) return "bg-green-600 text-white";
  if (score >= 4) return "bg-yellow-500 text-black";
  return "bg-red-600 text-white";
};

const neuralBadgeClass = (score: number) => {
  if (score >= 70) return "bg-green-600 text-white";
  if (score >= 40) return "bg-yellow-500 text-black";
  return "bg-red-600 text-white";
};

type NeuralState = "idle" | "loading" | "done" | "unavailable";

const FeedbackPage = () => {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [sessionResults, setSessionResults] = useState<SessionResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [neuralState, setNeuralState] = useState<NeuralState>("idle");
  const [neuralResults, setNeuralResults] = useState<NeuralResult[] | null>(null);

  const addInterview = useMutation(convexAddInterview);

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

        const avgScore =
          fb.length > 0
            ? Math.round(fb.reduce((sum, f) => sum + f.score, 0) / fb.length)
            : 0;

        const entry = {
          sessionId: localStorage.getItem("mockrot_session_id") ?? "",
          date: new Date().toLocaleString(),
          jobTitle: "Interview Session",
          avgScore,
          feedback: fb,
          questions: sessionData.map((s) => s.question),
          characterName: character?.name,
        };

        // Persist to Convex (primary) with localStorage fallback
        try {
          await addInterview(entry);
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
      } catch {
        setFeedbacks([]);
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

  const runNeuralAnalysis = async () => {
    setNeuralState("loading");
    const transcripts = sessionResults.map((s) => s.answer).filter(Boolean);
    if (transcripts.length === 0) { setNeuralState("unavailable"); return; }
    try {
      const res = await fetch(`${API_BASE}/api/neural-engagement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcripts }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { available: boolean; results: NeuralResult[] | null };
      if (!data.available || !data.results) { setNeuralState("unavailable"); return; }
      setNeuralResults(data.results);
      setNeuralState("done");
    } catch {
      setNeuralState("unavailable");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-white">
        <span className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Generating feedback…</p>
      </div>
    );
  }

  const avgScore =
    feedbacks.length > 0
      ? Math.round(feedbacks.reduce((sum, f) => sum + f.score, 0) / feedbacks.length)
      : 0;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-3xl font-bold text-white">Interview Feedback</h1>
          {feedbacks.length > 0 && (
            <div className="inline-flex items-center gap-2">
              <span className="text-gray-400 text-sm">Overall Score</span>
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${scoreBadgeClass(avgScore)}`}>
                {avgScore}/10
              </span>
            </div>
          )}
        </div>

        {feedbacks.length === 0 ? (
          <p className="text-center text-gray-500">No feedback available.</p>
        ) : (
          feedbacks.map((f, i) => (
            <div key={i} className="rounded-xl border border-gray-700 bg-gray-900 p-6 space-y-3">
              {sessionResults[i] && (
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Q{i + 1}: {sessionResults[i].question}
                </p>
              )}
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${scoreBadgeClass(f.score)}`}>
                  {f.score}/10
                </span>
              </div>
              <p className="text-gray-200 leading-relaxed">{f.critique}</p>
              <button
                onClick={() => speakFeedback(f.critique)}
                className="text-blue-400 text-sm hover:text-blue-300 transition-colors underline underline-offset-2"
              >
                Hear Feedback
              </button>
              {neuralState === "done" && neuralResults?.[i] && (
                <NeuralPanel result={neuralResults[i]} index={i} />
              )}
            </div>
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
            {neuralState === "idle" && (
              <button
                onClick={runNeuralAnalysis}
                className="w-full bg-purple-700 hover:bg-purple-600 text-white font-semibold py-2.5 rounded-xl transition-colors"
              >
                Run Neural Analysis
              </button>
            )}
            {neuralState === "loading" && (
              <div className="flex items-center gap-3 text-purple-300">
                <span className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Running TRIBE v2 brain analysis — ~20–60 s per answer…</span>
              </div>
            )}
            {neuralState === "unavailable" && (
              <p className="text-sm text-gray-500">
                Brain service unavailable. Start the Colab runner and set{" "}
                <code className="text-purple-400">BRAIN_SERVICE_URL</code> in your backend.
              </p>
            )}
            {neuralState === "done" && (
              <p className="text-sm text-green-400">✓ Neural analysis complete — brain maps shown above.</p>
            )}
          </div>
        )}

        <div className="flex justify-center pt-4">
          <Link
            to="/characters"
            className="bg-blue-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-blue-500 transition-colors"
          >
            Start New Interview
          </Link>
        </div>
      </div>
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
