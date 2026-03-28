import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "@/lib/api";
import type { Feedback, SessionResult } from "@/types";

const scoreBadgeClass = (score: number) => {
  if (score >= 7) return "bg-green-600 text-white";
  if (score >= 4) return "bg-yellow-500 text-black";
  return "bg-red-600 text-white";
};

const FeedbackPage = () => {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [sessionResults, setSessionResults] = useState<SessionResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadFeedback = async () => {
      const sessionData: SessionResult[] = JSON.parse(
        localStorage.getItem("sessionResults") ?? "[]"
      );
      setSessionResults(sessionData);
      const voiceId = localStorage.getItem("selectedVoiceId") ?? "";

      try {
        const res = await fetch(`${API_BASE}/api/get-feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionData, voiceId }),
        });
        if (!res.ok) throw new Error("Feedback request failed");
        const data = (await res.json()) as { feedback: Feedback[] };
        const fb = data.feedback ?? [];
        setFeedbacks(fb);

        // Save to history
        const history: unknown[] = JSON.parse(
          localStorage.getItem("interviewHistory") ?? "[]"
        );
        const avgScore =
          fb.length > 0
            ? Math.round(fb.reduce((sum, f) => sum + f.score, 0) / fb.length)
            : 0;
        const newEntry = {
          date: new Date().toLocaleString(),
          jobTitle: "Interview Session",
          avgScore,
          feedback: fb,
          questions: sessionData.map((s) => s.question),
        };
        localStorage.setItem(
          "interviewHistory",
          JSON.stringify([newEntry, ...history])
        );
      } catch {
        setFeedbacks([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadFeedback();
  }, []);

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
    } catch {
      // Non-fatal
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
        {/* Header */}
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-3xl font-bold text-white">Interview Feedback</h1>
          {feedbacks.length > 0 && (
            <div className="inline-flex items-center gap-2">
              <span className="text-gray-400 text-sm">Overall Score</span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-bold ${scoreBadgeClass(avgScore)}`}
              >
                {avgScore}/10
              </span>
            </div>
          )}
        </div>

        {feedbacks.length === 0 ? (
          <p className="text-center text-gray-500">No feedback available.</p>
        ) : (
          feedbacks.map((f, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-700 bg-gray-900 p-6 space-y-3"
            >
              {/* Question */}
              {sessionResults[i] && (
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Q{i + 1}: {sessionResults[i].question}
                </p>
              )}
              {/* Score */}
              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-bold ${scoreBadgeClass(f.score)}`}
                >
                  {f.score}/10
                </span>
              </div>
              {/* Critique */}
              <p className="text-gray-200 leading-relaxed">{f.critique}</p>
              {/* Hear feedback */}
              <button
                onClick={() => speakFeedback(f.critique)}
                className="text-blue-400 text-sm hover:text-blue-300 transition-colors underline underline-offset-2"
              >
                Hear Feedback
              </button>
            </div>
          ))
        )}

        {/* CTA */}
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

export default FeedbackPage;
