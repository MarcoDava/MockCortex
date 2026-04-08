import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { apiFetch } from "@/lib/api";

export const INTERVIEWERS = [
  {
    id: "sB7vwSCyX0tQmU24cW2C",
    name: "Jon",
    key: "jon",
    img: "https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=800",
    description: "Confident male interviewer with a clear and steady delivery.",
    tag: "Steady and direct",
  },
  {
    id: "zGjIP4SZlMnY9m93k97r",
    name: "Hope",
    key: "hope",
    img: "https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=800",
    description: "Warm female interviewer voice tuned for clarity and calm pacing.",
    tag: "Warm and calm",
  },
];

type Interviewer = typeof INTERVIEWERS[0];

const loadClonedVoices = (): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const char of INTERVIEWERS) {
    const stored = localStorage.getItem(`clonedVoice_${char.key}`);
    if (stored) result[char.key] = stored;
  }
  return result;
};

const CharactersPage = () => {
  const navigate = useNavigate();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [cloningKey, setCloningKey] = useState<string | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [clonedVoices, setClonedVoices] = useState<Record<string, string>>(loadClonedVoices);
  const [ytUrls, setYtUrls] = useState<Record<string, string>>({});

  const effectiveVoiceId = (char: Interviewer) => clonedVoices[char.key] ?? char.id;

  const selectCharacter = (char: Interviewer) => {
    localStorage.setItem("selectedVoiceId", effectiveVoiceId(char));
    localStorage.setItem("selectedCharacter", JSON.stringify({ ...char, id: effectiveVoiceId(char) }));
    localStorage.setItem("selectedInterviewerKey", char.key);
    navigate("/jobdescription");
  };

  const previewVoice = async (char: Interviewer) => {
    try {
      const res = await apiFetch("/api/ask-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `Hi, I am ${char.name}. I will guide your mock interview today.`,
          voiceId: effectiveVoiceId(char),
        }),
      });
      const blob = await res.blob();
      void new Audio(URL.createObjectURL(blob)).play();
    } catch {
      // Non-fatal preview failure.
    }
  };

  const handleYouTubeClone = async (char: Interviewer) => {
    const url = ytUrls[char.key]?.trim();
    if (!url) return;
    setCloneError(null);
    setCloningKey(char.key);
    try {
      const res = await apiFetch("/api/clone-voice-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl: url, interviewerName: char.name }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Clone failed");
      }
      const data = (await res.json()) as { voiceId: string };
      localStorage.setItem(`clonedVoice_${char.key}`, data.voiceId);
      setClonedVoices((prev) => ({ ...prev, [char.key]: data.voiceId }));
      setYtUrls((prev) => ({ ...prev, [char.key]: "" }));
    } catch (e) {
      setCloneError(e instanceof Error ? e.message : `Failed to clone ${char.name}'s voice.`);
    } finally {
      setCloningKey(null);
    }
  };

  const handleFileChange = (char: Interviewer, file: File) => {
    setCloneError(null);
    setCloningKey(char.key);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const audioBase64 = dataUrl.split(",")[1];
      try {
        const res = await apiFetch("/api/clone-voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64,
            mimeType: file.type || "audio/mpeg",
            interviewerName: char.name,
          }),
        });
        if (!res.ok) throw new Error("Clone failed");
        const data = (await res.json()) as { voiceId: string };
        localStorage.setItem(`clonedVoice_${char.key}`, data.voiceId);
        setClonedVoices((prev) => ({ ...prev, [char.key]: data.voiceId }));
      } catch {
        setCloneError(`Failed to clone ${char.name}'s voice. Try a different audio file.`);
      } finally {
        setCloningKey(null);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="page-stack pointer-events-auto">
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="surface-panel-strong p-6 sm:p-8"
      >
        <div className="max-w-3xl space-y-4">
          <span className="eyebrow">Interviewer selection</span>
          <h1 className="section-title text-slate-950">Choose the voice that sets the pressure level.</h1>
          <p className="body-muted max-w-2xl">
            Each interviewer is intentionally distinct. Preview the voice, then keep the default profile or clone a custom sample if you want a more realistic rehearsal.
          </p>
        </div>

        {cloneError && (
          <div className="mt-6 rounded-[22px] border border-[rgba(196,67,50,0.18)] bg-[rgba(255,239,234,0.84)] px-4 py-3 text-sm text-[rgb(145,51,34)]">
            {cloneError}
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {INTERVIEWERS.map((char, index) => {
            const isCloning = cloningKey === char.key;
            const hasClone = Boolean(clonedVoices[char.key]);

            return (
              <motion.article
                key={char.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1, ease: "easeOut" }}
                className="surface-panel overflow-hidden"
              >
                <div className="flex flex-col gap-6 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <img
                        src={char.img}
                        alt={char.name}
                        className="h-24 w-24 rounded-[24px] object-cover shadow-[0_18px_30px_rgba(15,23,42,0.12)]"
                        referrerPolicy="no-referrer"
                      />
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[rgb(154,77,37)]">{char.tag}</p>
                        <h2 className="text-2xl font-semibold text-slate-950">{char.name}</h2>
                        <p className="text-sm leading-6 text-slate-600">{char.description}</p>
                      </div>
                    </div>

                    {hasClone && !isCloning && (
                      <span className="rounded-full border border-[rgba(35,122,76,0.18)] bg-[rgba(228,248,237,0.8)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[rgb(46,108,73)]">
                        Custom active
                      </span>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button onClick={() => void previewVoice(char)} disabled={isCloning} className="secondary-button">
                      Preview voice
                    </button>
                    <button onClick={() => !isCloning && selectCharacter(char)} disabled={isCloning} className="primary-button">
                      Select interviewer
                    </button>
                  </div>

                  <div className="rounded-[24px] border border-[rgba(42,59,78,0.12)] bg-[rgba(250,245,236,0.85)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Clone from your own sample</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">Upload a voice clip or paste a YouTube link to personalize the session.</p>
                      </div>
                      {isCloning && (
                        <span className="rounded-full border border-[rgba(201,98,49,0.18)] bg-[rgba(255,247,239,0.84)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[rgb(154,77,37)]">
                          Cloning
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3">
                      <input
                        type="file"
                        accept="audio/mp3,audio/wav,audio/*"
                        className="hidden"
                        ref={(el) => {
                          fileInputRefs.current[char.key] = el;
                        }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileChange(char, file);
                          e.target.value = "";
                        }}
                      />

                      <button
                        onClick={() => fileInputRefs.current[char.key]?.click()}
                        disabled={isCloning}
                        className="secondary-button w-full"
                      >
                        {hasClone ? "Replace voice sample" : "Upload voice sample"}
                      </button>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <input
                          type="url"
                          placeholder="youtube.com/watch?v=..."
                          value={ytUrls[char.key] ?? ""}
                          onChange={(e) => setYtUrls((prev) => ({ ...prev, [char.key]: e.target.value }))}
                          disabled={isCloning}
                          className="min-h-12 flex-1 rounded-full border border-[rgba(42,59,78,0.14)] bg-white/80 px-4 text-sm text-slate-800 placeholder:text-slate-400"
                        />
                        <button
                          onClick={() => void handleYouTubeClone(char)}
                          disabled={isCloning || !ytUrls[char.key]?.trim()}
                          className="primary-button min-w-36 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Clone from YouTube
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </motion.section>
    </div>
  );
};

export default CharactersPage;
