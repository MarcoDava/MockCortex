import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "@/lib/api";
import type { Character, ResumeSummary } from "@/types";
import { INTERVIEWERS } from "@/Pages/CharactersPage/CharactersPage";

const JobDescriptionPage = () => {
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState<ResumeSummary | null>(() => {
    try {
      const saved = localStorage.getItem("resumeSummary");
      return saved ? (JSON.parse(saved) as ResumeSummary) : null;
    } catch { return null; }
  });
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const [voiceKey, setVoiceKey] = useState<string>(() => {
    return localStorage.getItem("selectedInterviewerKey") ?? "adam";
  });

  const character = (() => {
    try {
      const raw = localStorage.getItem("selectedCharacter");
      return raw ? (JSON.parse(raw) as Character) : null;
    } catch { return null; }
  })();

  const getVoiceId = (key: string) => {
    const preset = INTERVIEWERS.find((i) => i.key === key);
    if (!preset) return "";
    return localStorage.getItem(`clonedVoice_${key}`) ?? preset.id;
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
          // Strip data URL prefix to get raw base64
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`${API_BASE}/api/parse-resume`, {
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
    const voiceId = localStorage.getItem("selectedVoiceId");
    if (!voiceId) {
      setError("Please go back and select an interviewer first.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const resumeSummary = resume ?? undefined;
      const response = await fetch(`${API_BASE}/api/generate-questions`, {
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
          // ignore JSON parse errors and keep fallback message
        }
        throw new Error(message);
      }
      const data = (await response.json()) as { questions?: unknown[] };
      if (data.questions) {
        localStorage.setItem("interviewQuestions", JSON.stringify(data.questions));
        navigate("/interview");
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

  return (
    <div className="min-h-screen flex items-center justify-center p-6 pointer-events-auto">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold text-white">Set Up Your Interview</h1>
          <p className="text-gray-400 text-sm">
            Paste the job description and optionally upload your resume for tailored questions.
          </p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/4 p-4 space-y-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p className="text-gray-300 text-sm font-medium">Interviewer voice</p>
          <div className="grid grid-cols-2 gap-3">
            {INTERVIEWERS.map((voice) => {
              const selected = voiceKey === voice.key;
              const hasClone = Boolean(localStorage.getItem(`clonedVoice_${voice.key}`));
              return (
                <button
                  key={voice.key}
                  type="button"
                  onClick={() => switchVoice(voice.key)}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                    selected
                      ? "border-violet-500/60 bg-violet-600/10 shadow-[0_0_0_1px_rgba(139,92,246,0.25)]"
                      : "border-white/8 bg-white/4 hover:border-white/16 hover:bg-white/6"
                  }`}
                >
                  <p className="text-white text-sm font-semibold">{voice.name}</p>
                  <p className="text-gray-400 text-xs mt-1">{hasClone ? "Custom clone active" : "Default ElevenLabs voice"}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Interviewer confirmation */}
        {character ? (
          <div className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-2xl px-4 py-3">
            <img
              src={character.img}
              alt={character.name}
              className="w-10 h-10 rounded-full object-cover border-2 border-gray-600"
            />
            <div>
              <p className="text-white text-sm font-semibold">{character.name}</p>
              <p className="text-gray-400 text-xs">Current interviewer voice</p>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl px-4 py-3 text-yellow-400 text-sm">
            No interviewer selected - go back to{" "}
            <a href="/characters" className="underline">
              Interviewers
            </a>{" "}
            first.
          </div>
        )}

        {/* Resume upload */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-300">
              Resume <span className="text-gray-500 font-normal">(optional · PDF only)</span>
            </label>
            {resume && (
              <button
                onClick={clearResume}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                Remove
              </button>
            )}
          </div>

          {!resume ? (
            <div>
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
                className="flex items-center justify-center gap-2 w-full border border-dashed border-white/12 rounded-2xl py-6 cursor-pointer hover:border-violet-500/40 hover:bg-violet-600/4 transition-all text-gray-500 hover:text-violet-300 text-sm"
              >
                {resumeLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                    Parsing resume…
                  </>
                ) : (
                  <>
                    <span className="text-lg">📄</span>
                    Click to upload PDF resume
                  </>
                )}
              </label>
              {resumeError && (
                <p className="text-yellow-400 text-xs mt-1">{resumeError}</p>
              )}
            </div>
          ) : (
            <div className="bg-emerald-500/8 border border-emerald-500/25 rounded-2xl px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-green-400 text-sm">✓</span>
                <p className="text-green-400 text-sm font-medium">
                  {resumeFileName ?? "Resume uploaded"}
                  {resume.name ? ` — ${resume.name}` : ""}
                </p>
              </div>
              {resume.skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {resume.skills.slice(0, 6).map((s) => (
                    <span
                      key={s}
                      className="text-xs bg-white/5 border border-white/8 text-gray-300 px-2 py-0.5 rounded-full"
                    >
                      {s}
                    </span>
                  ))}
                  {resume.skills.length > 6 && (
                    <span className="text-xs text-gray-500">+{resume.skills.length - 6} more</span>
                  )}
                </div>
              )}
              {resume.experience && (
                <p className="text-gray-400 text-xs leading-relaxed">{resume.experience}</p>
              )}
            </div>
          )}
        </div>

        {/* Textarea */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Job Description
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isLoading}
            rows={8}
            placeholder="Paste the full job description here (minimum 20 characters)…"
            className="w-full resize-none rounded-2xl bg-white/4 border border-white/8 text-gray-100 p-4 placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50 focus:bg-white/6 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)] disabled:opacity-50 transition-all duration-200"
          />
          <p className="text-gray-500 text-xs text-right">{text.trim().length} chars</p>
        </div>

        {/* Interview structure note */}
        <div className="bg-white/3 border border-white/6 rounded-2xl px-4 py-3 space-y-1">
          <p className="text-gray-300 text-xs font-medium">Interview structure (5 questions)</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {[
              { label: "Intro", color: "text-blue-400" },
              { label: "Resume", color: "text-purple-400" },
              { label: "Behavioral", color: "text-yellow-400" },
              { label: "Technical", color: "text-green-400" },
              { label: "Situational", color: "text-orange-400" },
            ].map(({ label, color }) => (
              <span key={label} className={`text-xs font-medium ${color}`}>
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-2">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          onClick={startInterview}
          disabled={!isValid || isLoading || !character}
          className="w-full flex items-center justify-center gap-2 bg-violet-600 text-white font-semibold py-3.5 rounded-2xl hover:bg-violet-500 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating questions…
            </>
          ) : (
            "Start Interview"
          )}
        </button>
      </div>
    </div>
  );
};

export default JobDescriptionPage;
