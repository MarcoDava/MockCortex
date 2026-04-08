import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { convexGetBySession, convexTouchSession } from "@/lib/convexFunctions";
import type { InterviewSession } from "@/types";

const scoreBadgeClass = (score: number) => {
  if (score >= 8) return "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300";
  if (score >= 6) return "bg-green-500/12 border border-green-500/25 text-green-400";
  if (score >= 4) return "bg-amber-500/12 border border-amber-500/25 text-amber-300";
  return "bg-red-500/12 border border-red-500/25 text-red-400";
};

const PastInterviewsPage = () => {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const sessionId = localStorage.getItem("mockcortex_session_id") ?? "";
  const touchSession = useMutation(convexTouchSession);

  const convexHistory = useQuery(convexGetBySession, { sessionId });

  const [localHistory, setLocalHistory] = useState<InterviewSession[]>([]);
  useEffect(() => {
    const saved = localStorage.getItem("interviewHistory");
    if (saved) setLocalHistory(JSON.parse(saved) as InterviewSession[]);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    void touchSession({ sessionId });
  }, [sessionId, touchSession]);

  const history: InterviewSession[] =
    convexHistory != null ? (convexHistory as InterviewSession[]) : localHistory;

  const isLoading = convexHistory === undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen gap-3 text-white">
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 rounded-full border-2 border-white/8" />
          <div className="absolute inset-0 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-gray-400">Loading history…</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 text-center px-6 pointer-events-auto">
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 rounded-3xl bg-violet-600/10 border border-violet-500/20" />
          <div className="absolute inset-3 rounded-2xl bg-violet-600/15 border border-violet-500/25" />
          <div className="absolute inset-6 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
            <span className="text-violet-400 text-xl font-light">+</span>
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-white">No interviews yet</h2>
          <p className="text-gray-500 text-sm max-w-xs leading-relaxed">
            Your recordings, scores, and feedback will appear here after your first interview.
          </p>
        </div>
        <Link
          to="/characters"
          className="px-6 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]"
        >
          Start your first interview
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 pointer-events-auto">
      <div className="max-w-3xl mx-auto space-y-3">
        <h1 className="text-3xl font-bold text-white mb-8">Past Interviews</h1>

        {history.map((session, i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/8 bg-white/4 overflow-hidden hover:border-white/14 transition-all duration-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            <button
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/4 transition-colors text-left"
            >
              <div className="space-y-0.5">
                <p className="text-violet-400 font-medium text-sm">{session.date}</p>
                <p className="text-gray-500 text-xs">{session.jobTitle}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${scoreBadgeClass(session.avgScore)}`}>
                  {session.avgScore}/10
                </span>
                <svg
                  className={`w-4 h-4 text-gray-600 transition-transform duration-200 ${expandedIdx === i ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {expandedIdx === i && session.feedback && session.feedback.length > 0 && (
              <div className="border-t border-white/6 divide-y divide-white/5">
                {session.feedback.map((f, j) => (
                  <div key={j} className="px-5 py-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Q{j + 1}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${scoreBadgeClass(f.score)}`}>
                        {f.score}/10
                      </span>
                    </div>
                    <p className="text-gray-300 text-sm leading-relaxed">{f.critique}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PastInterviewsPage;
