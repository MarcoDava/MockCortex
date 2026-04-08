import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { API_BASE } from "@/lib/api";

export const INTERVIEWERS = [
  {
    id: "sB7vwSCyX0tQmU24cW2C",
    name: "Jon",
    key: "jon",
    img: "https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=800",
    description: "Confident male interviewer with a clear and steady delivery.",
    tag: "Male Voice",
    tagColor: "text-violet-300 bg-violet-500/10 border-violet-500/20",
  },
  {
    id: "zGjIP4SZlMnY9m93k97r",
    name: "Hope",
    key: "hope",
    img: "https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=800",
    description: "Warm female interviewer voice tuned for clarity and calm pacing.",
    tag: "Female Voice",
    tagColor: "text-purple-300 bg-purple-500/10 border-purple-500/20",
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
      const res = await fetch(`${API_BASE}/api/ask-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `Hi, I am ${char.name}. I will guide your mock interview today.`,
          voiceId: effectiveVoiceId(char),
        }),
      });
      const blob = await res.blob();
      new Audio(URL.createObjectURL(blob)).play();
    } catch {
      // Non-fatal
    }
  };

  const handleYouTubeClone = async (char: Interviewer) => {
    const url = ytUrls[char.key]?.trim();
    if (!url) return;
    setCloneError(null);
    setCloningKey(char.key);
    try {
      const res = await fetch(`${API_BASE}/api/clone-voice-youtube`, {
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
        const res = await fetch(`${API_BASE}/api/clone-voice`, {
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
    <div className="min-h-screen px-6 pb-20 pointer-events-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl mx-auto"
      >
        {/* Header */}
        <div className="text-center mb-12 space-y-3">
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-[1.1]">
            Choose your{" "}
            <span className="bg-gradient-to-r from-violet-400 to-rose-400 bg-clip-text text-transparent">
              interviewer voice
            </span>
          </h1>
          <p className="text-gray-400 text-base max-w-md mx-auto">
            Click a card to select. Optionally upload an MP3 or paste a YouTube link to clone any voice.
          </p>
        </div>

        {cloneError && (
          <p className="mb-8 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-xl px-4 py-3 max-w-md mx-auto text-center">
            {cloneError}
          </p>
        )}

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {INTERVIEWERS.map((char, i) => {
            const isCloning = cloningKey === char.key;
            const hasClone = Boolean(clonedVoices[char.key]);

            return (
              <motion.div
                key={char.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                onClick={() => !isCloning && selectCharacter(char)}
                className="group relative flex flex-col items-center p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-violet-500/60 hover:bg-violet-600/5 transition-all duration-300 cursor-pointer hover:shadow-[0_0_40px_rgba(139,92,246,0.15)]"
              >
                {/* Character tag */}
                <span className={`absolute top-4 right-4 text-xs font-semibold px-2.5 py-1 rounded-full border ${char.tagColor}`}>
                  {char.tag}
                </span>

                {/* Avatar */}
                <div className="relative mb-5">
                  <div className="w-28 h-28 rounded-2xl overflow-hidden ring-2 ring-white/10 group-hover:ring-violet-500/50 transition-all duration-300">
                    <img src={char.img} alt={char.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                  </div>
                </div>

                <h2 className="text-xl font-bold text-white text-center">{char.name}</h2>
                <p className="text-gray-400 mt-1.5 text-sm text-center leading-relaxed">{char.description}</p>

                {hasClone && !isCloning && (
                  <span className="mt-3 text-xs bg-green-500/10 border border-green-500/30 text-green-400 px-3 py-1 rounded-full font-medium">
                    Custom voice active
                  </span>
                )}
                {isCloning && (
                  <span className="mt-3 text-xs text-yellow-400 flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                    Cloning voice…
                  </span>
                )}

                {/* Actions */}
                <div
                  className="mt-5 flex flex-col gap-2 w-full"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => previewVoice(char)}
                    disabled={isCloning}
                    className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-sm font-medium transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    Preview voice
                  </button>

                  <input
                    type="file"
                    accept="audio/mp3,audio/wav,audio/*"
                    className="hidden"
                    ref={(el) => { fileInputRefs.current[char.key] = el; }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileChange(char, file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    onClick={() => fileInputRefs.current[char.key]?.click()}
                    disabled={isCloning}
                    className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    {hasClone ? "Replace voice sample" : "Upload voice sample"}
                  </button>

                  {/* YouTube URL clone */}
                  <div className="flex gap-1.5">
                    <input
                      type="url"
                      placeholder="youtube.com/watch?v=..."
                      value={ytUrls[char.key] ?? ""}
                      onChange={(e) => setYtUrls((prev) => ({ ...prev, [char.key]: e.target.value }))}
                      disabled={isCloning}
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-violet-500/60 disabled:opacity-40"
                    />
                    <button
                      onClick={() => handleYouTubeClone(char)}
                      disabled={isCloning || !ytUrls[char.key]?.trim()}
                      className="shrink-0 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      {isCloning ? (
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                      ) : "YT"}
                    </button>
                  </div>
                </div>

                {/* Select arrow hint */}
                <div className="mt-4 w-full pt-4 border-t border-white/8">
                  <p className="text-center text-xs text-gray-600 group-hover:text-violet-400 transition-colors font-medium">
                    Select and continue
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};

export default CharactersPage;
