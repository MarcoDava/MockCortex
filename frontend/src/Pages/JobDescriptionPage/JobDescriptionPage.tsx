import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "@/lib/api";
import type { Character } from "@/types";

const JobDescriptionPage = () => {
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const character = (() => {
    try {
      const raw = localStorage.getItem("selectedCharacter");
      return raw ? (JSON.parse(raw) as Character) : null;
    } catch {
      return null;
    }
  })();

  const isValid = text.trim().length >= 20;

  const startInterview = async () => {
    const voiceId = localStorage.getItem("selectedVoiceId");
    if (!voiceId) {
      setError("Please go back and select a character first.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/generate-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: text, voiceId }),
      });
      if (!response.ok) throw new Error("Server error");
      const data = (await response.json()) as { questions?: unknown[] };
      if (data.questions) {
        localStorage.setItem("interviewQuestions", JSON.stringify(data.questions));
        navigate("/interview");
      } else {
        throw new Error("No questions returned");
      }
    } catch {
      setError("Failed to generate questions. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold text-white">Paste the Job Description</h1>
          <p className="text-gray-400 text-sm">
            The AI will generate tailored interview questions based on the role.
          </p>
        </div>

        {/* Character confirmation */}
        {character ? (
          <div className="flex items-center gap-3 bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3">
            <img
              src={character.img}
              alt={character.name}
              className="w-10 h-10 rounded-full object-cover border-2 border-gray-600"
            />
            <div>
              <p className="text-white text-sm font-semibold">{character.name}</p>
              <p className="text-gray-400 text-xs">Your interviewer</p>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl px-4 py-3 text-yellow-400 text-sm">
            No character selected — go back to{" "}
            <a href="/characters" className="underline">
              Characters
            </a>{" "}
            first.
          </div>
        )}

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
            className="w-full resize-none rounded-xl bg-gray-800 border border-gray-700 text-white p-4 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition"
          />
          <p className="text-gray-500 text-xs text-right">{text.trim().length} chars</p>
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
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
