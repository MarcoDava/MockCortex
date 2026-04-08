import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { convexGetMyInterviews, convexTouchMyInterviews } from "@/lib/convexFunctions";
import type { InterviewSession } from "@/types";

const scoreBadgeClass = (score: number) => {
  if (score >= 8) return "border-[rgba(35,122,76,0.18)] bg-[rgba(228,248,237,0.8)] text-[rgb(46,108,73)]";
  if (score >= 6) return "border-[rgba(162,121,36,0.18)] bg-[rgba(255,244,215,0.8)] text-[rgb(145,99,27)]";
  if (score >= 4) return "border-[rgba(188,116,51,0.18)] bg-[rgba(255,238,222,0.82)] text-[rgb(154,77,37)]";
  return "border-[rgba(196,67,50,0.18)] bg-[rgba(255,239,234,0.84)] text-[rgb(145,51,34)]";
};

const PastInterviewsPage = () => {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const touchMyInterviews = useMutation(convexTouchMyInterviews);
  const history = useQuery(convexGetMyInterviews, {});

  useEffect(() => {
    void touchMyInterviews({});
  }, [touchMyInterviews]);

  const isLoading = history === undefined;

  if (isLoading) {
    return (
      <div className="pointer-events-auto flex min-h-[60vh] items-center justify-center">
        <div className="surface-panel flex items-center gap-4 px-6 py-5">
          <div className="h-8 w-8 rounded-full border-2 border-[rgba(201,98,49,0.2)] border-t-[rgb(182,86,41)] animate-spin" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Loading session archive</p>
            <p className="text-sm text-slate-600">Pulling your interview history from Convex.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="pointer-events-auto mx-auto max-w-3xl">
        <div className="surface-panel-strong p-8 text-center">
          <span className="eyebrow">Session archive</span>
          <h1 className="section-title mt-4 text-slate-950">No sessions saved yet.</h1>
          <p className="body-muted mx-auto mt-3 max-w-xl">
            Once you finish an interview, the scorecards and critiques will appear here so you can compare attempts instead of starting from memory.
          </p>
          <Link to="/characters" className="primary-button mt-8">
            Start your first interview
          </Link>
        </div>
      </div>
    );
  }

  const sessions = history as InterviewSession[];

  return (
    <div className="page-stack pointer-events-auto">
      <section className="surface-panel-strong p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <span className="eyebrow">Session archive</span>
            <h1 className="section-title text-slate-950">Your practice history, organized like work product.</h1>
            <p className="body-muted max-w-2xl">
              Strong prep is cumulative. Use the archive to compare scores, inspect question-level critique, and watch how your delivery changes across attempts.
            </p>
          </div>
          <Link to="/characters" className="secondary-button">
            Start another session
          </Link>
        </div>
      </section>

      <section className="grid gap-4">
        {sessions.map((session, index) => (
          <article key={index} className="surface-panel overflow-hidden">
            <button
              onClick={() => setExpandedIdx(expandedIdx === index ? null : index)}
              className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left"
            >
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[rgb(154,77,37)]">{session.date}</p>
                <h2 className="text-xl font-semibold text-slate-950">{session.jobTitle}</h2>
                <p className="text-sm text-slate-600">{session.interviewerName ?? "MockCortex interviewer"}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full border px-3 py-1 text-sm font-bold ${scoreBadgeClass(session.avgScore)}`}>
                  {session.avgScore}/10
                </span>
                <svg
                  className={`h-5 w-5 text-slate-500 transition-transform ${expandedIdx === index ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {expandedIdx === index && session.feedback && session.feedback.length > 0 && (
              <div className="border-t border-[rgba(107,83,57,0.12)] px-5 py-5">
                <div className="grid gap-4">
                  {session.feedback.map((feedback, feedbackIndex) => (
                    <div key={feedbackIndex} className="rounded-[24px] border border-[rgba(107,83,57,0.12)] bg-white/80 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-[rgb(154,77,37)]">
                          Question {feedbackIndex + 1}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${scoreBadgeClass(feedback.score)}`}>
                          {feedback.score}/10
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-slate-700">{feedback.critique}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
};

export default PastInterviewsPage;
