import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { convexGetBySession } from "@/lib/convexFunctions";
import type { InterviewSession } from "@/types";

const scoreBadgeClass = (score: number) => {
  if (score >= 7) return "bg-green-600 text-white";
  if (score >= 4) return "bg-yellow-500 text-black";
  return "bg-red-600 text-white";
};

const PastInterviewsPage = () => {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const sessionId = localStorage.getItem("mockrot_session_id") ?? "";

  // Convex real-time query — returns undefined while loading, null if not connected
  const convexHistory = useQuery(convexGetBySession, { sessionId });

  // localStorage fallback for when Convex is not configured
  const [localHistory, setLocalHistory] = useState<InterviewSession[]>([]);
  useEffect(() => {
    const saved = localStorage.getItem("interviewHistory");
    if (saved) setLocalHistory(JSON.parse(saved) as InterviewSession[]);
  }, []);

  // Use Convex data when available, otherwise fall back to localStorage
  const history: InterviewSession[] =
    convexHistory != null
      ? (convexHistory as InterviewSession[])
      : localHistory;

  const isLoading = convexHistory === undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen gap-3 text-white">
        <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Loading history…</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-6">
        <p className="text-5xl">📋</p>
        <h2 className="text-2xl font-bold text-white">No interviews yet</h2>
        <p className="text-gray-400 text-sm">
          Complete your first interview to see results here.
        </p>
        <Link
          to="/characters"
          className="bg-blue-600 text-white px-6 py-2 rounded-full font-semibold hover:bg-blue-500 transition-colors"
        >
          Start Interview
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 pointer-events-auto">
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-3xl font-bold text-white mb-8">Past Interviews</h1>

        {history.map((session, i) => (
          <div key={i} className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
            <button
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-800/50 transition-colors text-left"
            >
              <div className="space-y-0.5">
                <p className="text-blue-400 font-semibold text-sm">{session.date}</p>
                <p className="text-gray-400 text-xs">{session.jobTitle}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${scoreBadgeClass(session.avgScore)}`}>
                  {session.avgScore}/10
                </span>
                <span className="text-gray-500 text-sm">{expandedIdx === i ? "▲" : "▼"}</span>
              </div>
            </button>

            {expandedIdx === i && session.feedback && session.feedback.length > 0 && (
              <div className="border-t border-gray-700 divide-y divide-gray-800">
                {session.feedback.map((f, j) => (
                  <div key={j} className="px-6 py-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs font-medium">Q{j + 1}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${scoreBadgeClass(f.score)}`}>
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
