import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { apiFetch } from "@/lib/api";
import { parseLocalStorageJson, clonedVoiceKey } from "@/lib/utils";
import { convexCurrentUser } from "@/lib/convexFunctions";
import type { Character, Question, ResumeSummary } from "@/types";
import { INTERVIEWERS } from "@/Pages/CharactersPage/CharactersPage";

const JobDescriptionPage = () => {
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState<ResumeSummary | null>(() => parseLocalStorageJson<ResumeSummary>("resumeSummary"));
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const currentUser = useQuery(convexCurrentUser, {});

  const [generatedQuestions, setGeneratedQuestions] = useState<Question[] | null>(null);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());

  const [voiceKey, setVoiceKey] = useState<string>(() => {
    return localStorage.getItem("selectedInterviewerKey") ?? "jon";
  });

  const character = parseLocalStorageJson<Character>("selectedCharacter");

  const getVoiceId = (key: string) => {
    const preset = INTERVIEWERS.find((i) => i.key === key);
    if (!preset) return "";
    return localStorage.getItem(clonedVoiceKey(key)) ?? preset.id;
  };

  const switchVoice = (key: string) => {
    const preset = INTERVIEWERS.find((i) => i.key === key);
    if (!preset) return;
    const effectiveId = getVoiceId(key);
    setVoiceKey(key);
    localStorage.setItem("selectedInterviewerKey", key);
    localStorage.setItem("selectedVoiceId", effectiveId);
    localStorage.setItem("selectedCharacter", JSON.stringify({ ...preset, id: effectiveId }));
  };

  const isValid = text.trim().length >= 20;

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      setResumeError("Only PDF files are supported. Please convert your resume to PDF.");
      return;
    }
    setResumeLoading(true);
    setResumeError(null);
    setResumeFileName(file.name);
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await apiFetch("/api/parse-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64, mimeType: "application/pdf" }),
      });
      if (!res.ok) throw new Error("Failed to parse resume");
      const data = (await res.json()) as ResumeSummary;
      setResume(data);
      localStorage.setItem("resumeSummary", JSON.stringify(data));
    } catch {
      setResumeError("Could not parse resume. You can still continue without it.");
    } finally {
      setResumeLoading(false);
    }
  };

  const clearResume = () => {
    setResume(null);
    setResumeFileName(null);
    setResumeError(null);
    localStorage.removeItem("resumeSummary");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startInterview = async () => {
    if (currentUser === undefined) {
      setError("Loading your account. Please try again in a moment.");
      return;
    }
    if (!currentUser) {
      setError("We are still finishing your account setup. Please try again in a moment.");
      return;
    }

    const hasPro = typeof currentUser.proUntil === "number" && currentUser.proUntil > Date.now();
    const hasCredits = currentUser.interviewCredits > 0;
    const canStart = hasPro || hasCredits || !currentUser.freeInterviewUsed;
    if (!canStart) {
      setError("Your one-time free interview has already been used. Add credits or Pro next.");
      return;
    }

    const voiceId = localStorage.getItem("selectedVoiceId");
    if (!voiceId) {
      setError("Please go back and select an interviewer first.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const resumeSummary = resume ?? undefined;
      const response = await apiFetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: text, voiceId, resumeSummary }),
      });
      if (!response.ok) {
        let message = "Server error";
        try {
          const errData = (await response.json()) as { error?: string };
          if (errData?.error) message = errData.error;
        } catch {
          // Keep fallback message.
        }
        throw new Error(message);
      }
      const data = (await response.json()) as { questions?: Question[] };
      if (data.questions && data.questions.length > 0) {
        const allIndices = new Set(data.questions.map((_, i) => i));
        setGeneratedQuestions(data.questions);
        setSelectedQuestions(allIndices);
      } else {
        throw new Error("No questions returned");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate questions. Check your connection and try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleQuestion = (idx: number) => {
    setSelectedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const confirmQuestions = () => {
    if (!generatedQuestions) return;
    const chosen = generatedQuestions.filter((_, i) => selectedQuestions.has(i));
    if (chosen.length === 0) return;
    localStorage.setItem("interviewQuestions", JSON.stringify(chosen));
    navigate("/interview");
  };

  const TYPE_LABEL: Record<string, string> = {
    intro: "Intro",
    resume: "Resume",
    behavioral: "Behavioral",
    technical: "Technical",
    situational: "Situational",
  };

  const accountBanner =
    currentUser === undefined
      ? "Syncing your signed-in account..."
      : currentUser?.freeInterviewUsed
        ? "Free session used. Credits or Pro will be the next step."
        : "Your signed-in account still has 1 free interview available.";

  return (
    <div className="page-stack pointer-events-auto">
      <section className="surface-panel-strong p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-5">
            <span className="eyebrow">Interview setup</span>
            <h1 className="section-title text-slate-950">Build the brief before you enter the room.</h1>
            <p className="body-muted max-w-xl">
              Paste the target role, confirm the interviewer voice, and optionally attach your resume so the questions feel like they belong to the actual opportunity.
            </p>

            <div className="rounded-[24px] border border-[rgba(42,59,78,0.12)] bg-white/80 p-5">
              <p className="text-sm font-semibold text-slate-900">Account status</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{accountBanner}</p>
            </div>

            {character ? (
              <div className="ink-panel flex items-center gap-4 p-5">
                <img src={character.img} alt={character.name} className="h-16 w-16 rounded-[20px] object-cover" />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[rgba(235,205,181,0.72)]">Current interviewer</p>
                  <p className="mt-1 text-xl font-semibold text-white">{character.name}</p>
                  <p className="text-sm text-slate-300">You can still switch voices below before generating the session.</p>
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] border border-[rgba(196,142,50,0.2)] bg-[rgba(255,247,226,0.86)] p-4 text-sm leading-6 text-[rgb(130,91,20)]">
                No interviewer selected yet. Return to <a href="/characters" className="font-semibold underline">Interviewers</a> first.
              </div>
            )}
          </div>

          <div className="grid gap-4">
            <div className="surface-panel p-5">
              <p className="text-sm font-semibold text-slate-900">Voice profile</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {INTERVIEWERS.map((voice) => {
                  const selected = voiceKey === voice.key;
                  const hasClone = Boolean(localStorage.getItem(clonedVoiceKey(voice.key)));
                  return (
                    <button
                      key={voice.key}
                      type="button"
                      onClick={() => switchVoice(voice.key)}
                      className={`rounded-[22px] border px-4 py-4 text-left transition-all ${
                        selected
                          ? "border-[rgba(182,86,41,0.28)] bg-[rgba(255,244,234,0.95)] shadow-[0_12px_24px_rgba(182,86,41,0.12)]"
                          : "border-[rgba(42,59,78,0.12)] bg-white/80 hover:-translate-y-0.5"
                      }`}
                    >
                      <p className="text-lg font-semibold text-slate-950">{voice.name}</p>
                      <p className="mt-1 text-sm text-slate-600">{hasClone ? "Custom clone active" : "Default voice profile"}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="surface-panel p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Resume</p>
                  <p className="mt-1 text-sm text-slate-600">Optional. PDF only.</p>
                </div>
                {resume && (
                  <button onClick={clearResume} className="text-sm font-semibold text-[rgb(154,77,37)]">
                    Remove
                  </button>
                )}
              </div>

              {!resume ? (
                <div className="mt-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleResumeUpload}
                    className="hidden"
                    id="resume-upload"
                  />
                  <label
                    htmlFor="resume-upload"
                    className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-[rgba(107,83,57,0.24)] bg-[rgba(251,244,234,0.8)] px-6 text-center"
                  >
                    {resumeLoading ? (
                      <>
                        <span className="h-5 w-5 rounded-full border-2 border-[rgba(201,98,49,0.28)] border-t-[rgb(182,86,41)] animate-spin" />
                        <span className="mt-3 text-sm font-semibold text-slate-900">Parsing resume...</span>
                      </>
                    ) : (
                      <>
                        <span className="text-[11px] font-bold uppercase tracking-[0.26em] text-[rgb(154,77,37)]">Resume context</span>
                        <span className="mt-3 text-lg font-semibold text-slate-950">Upload your PDF resume</span>
                        <span className="mt-2 text-sm leading-6 text-slate-600">We will extract experience, skills, and highlights for better prompts.</span>
                      </>
                    )}
                  </label>
                  {resumeError && <p className="mt-3 text-sm text-[rgb(145,51,34)]">{resumeError}</p>}
                </div>
              ) : (
                <div className="mt-4 rounded-[24px] border border-[rgba(35,122,76,0.18)] bg-[rgba(228,248,237,0.8)] p-4">
                  <p className="text-sm font-semibold text-[rgb(46,108,73)]">
                    {resumeFileName ?? "Resume uploaded"}
                    {resume.name ? ` - ${resume.name}` : ""}
                  </p>
                  {resume.skills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {resume.skills.slice(0, 6).map((skill) => (
                        <span key={skill} className="rounded-full border border-[rgba(35,122,76,0.14)] bg-white/70 px-3 py-1 text-xs font-medium text-[rgb(46,108,73)]">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                  {resume.experience && <p className="mt-3 text-sm leading-6 text-[rgb(46,108,73)]">{resume.experience}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel p-6 sm:p-8">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Job description</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">Paste the full role brief. The more specific the context, the better the interview script.</p>
            </div>
            <p className="text-sm font-medium text-slate-500">{text.trim().length} characters</p>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isLoading}
            rows={10}
            placeholder="Paste the full job description here..."
            className="min-h-[280px] w-full resize-none rounded-[28px] border border-[rgba(42,59,78,0.14)] bg-white/85 p-5 text-base leading-7 text-slate-800 placeholder:text-slate-400"
          />

          {error && (
            <div className="rounded-[22px] border border-[rgba(196,67,50,0.18)] bg-[rgba(255,239,234,0.84)] px-4 py-3 text-sm text-[rgb(145,51,34)]">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => void startInterview()}
              disabled={!isValid || isLoading}
              className="primary-button disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Generating questions..." : "Generate questions"}
            </button>
            <p className="text-sm leading-6 text-slate-500">Minimum 20 characters required. You will be able to review and select which questions to include before starting.</p>
          </div>
        </div>
      </section>

      {generatedQuestions && (
        <section className="surface-panel p-6 sm:p-8">
          <div className="space-y-5">
            <div>
              <span className="eyebrow">Review questions</span>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">Choose which questions to include</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Toggle any question off to skip it during the interview. At least one must be selected.</p>
            </div>

            <div className="space-y-3">
              {generatedQuestions.map((q, i) => {
                const on = selectedQuestions.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleQuestion(i)}
                    className={`w-full rounded-[22px] border px-5 py-4 text-left transition-all ${
                      on
                        ? "border-[rgba(42,59,78,0.18)] bg-white shadow-[0_2px_8px_rgba(42,59,78,0.06)]"
                        : "border-[rgba(42,59,78,0.08)] bg-white/40 opacity-50"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        on
                          ? "border-[rgb(154,77,37)] bg-[rgb(154,77,37)]"
                          : "border-[rgba(42,59,78,0.22)] bg-transparent"
                      }`}>
                        {on && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="rounded-full border border-[rgba(42,59,78,0.12)] bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {TYPE_LABEL[q.type] ?? q.type}
                          </span>
                          <span className="text-xs text-slate-400">Q{i + 1}</span>
                        </div>
                        <p className="text-sm leading-6 text-slate-800">{q.question}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={confirmQuestions}
                disabled={selectedQuestions.size === 0}
                className="primary-button disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start interview ({selectedQuestions.size} question{selectedQuestions.size !== 1 ? "s" : ""})
              </button>
              <button
                onClick={() => {
                  setGeneratedQuestions(null);
                  setSelectedQuestions(new Set());
                }}
                className="rounded-[22px] border border-[rgba(42,59,78,0.14)] bg-white/80 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:-translate-y-0.5"
              >
                Regenerate
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default JobDescriptionPage;
