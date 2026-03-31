import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { API_BASE } from "@/lib/api";

export const CHARACTERS = [
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "Skibidi Toilet",
    key: "skibidi",
    img: "https://images-ext-1.discordapp.net/external/Hap2lryvnginFongsyxwLoApIFGpEy9DQhWLM49y65Q/%3Fw%3D1600%26h%3D1600%26fit%3Dcrop/https/static0.thegamerimages.com/wordpress/wp-content/uploads/2025/11/a-screenshot-from-skibidi-toilet-showing-giant-toilets-with-a-mans-head-poking-out-3.jpg?format=webp&width=1221&height=1221",
    description: "High energy brainrot. Very rizz-focused.",
    tag: "Chaotic",
    tagColor: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  },
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Trump",
    key: "trump",
    img: "https://images-ext-1.discordapp.net/external/O-fnPVcZNp2xui2WCKT9F4eVBV8Lm20lb3IwNsgfLdY/%3Fcrop%3D0.646xw%3A0.969xh%3B0.148xw%2C0%26resize%3D640%3A%2A/https/hips.hearstapps.com/hmg-prod/images/gettyimages-2194420718-67d9b4e326598.jpg?format=webp&width=960&height=960",
    description: "The best interviewer. Huge questions. Tremendous.",
    tag: "Dominant",
    tagColor: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Tung Tung Tung Sahur",
    key: "sahur",
    img: "https://play-lh.googleusercontent.com/blFJnPG3FC5gqUmZOMPT9cAY6T2dfteTNK5KlKnEoQKgXk1xJF9_pKqPy_vVKyjo_h9l=w240-h480-rw",
    description: "Wake up! Energy-filled Indonesian brainrot.",
    tag: "Hype",
    tagColor: "text-green-400 bg-green-500/10 border-green-500/20",
  },
];

type Character = typeof CHARACTERS[0];

const loadClonedVoices = (): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const char of CHARACTERS) {
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

  const effectiveVoiceId = (char: Character) => clonedVoices[char.key] ?? char.id;

  const selectCharacter = (char: Character) => {
    localStorage.setItem("selectedVoiceId", effectiveVoiceId(char));
    localStorage.setItem("selectedCharacter", JSON.stringify({ ...char, id: effectiveVoiceId(char) }));
    navigate("/jobdescription");
  };

  const previewVoice = async (char: Character) => {
    try {
      const res = await fetch(`${API_BASE}/api/ask-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `Hello! I am ${char.name}. Are you ready for the best interview of your life?`,
          voiceId: effectiveVoiceId(char),
        }),
      });
      const blob = await res.blob();
      new Audio(URL.createObjectURL(blob)).play();
    } catch {
      // Non-fatal
    }
  };

  const handleYouTubeClone = async (char: Character) => {
    const url = ytUrls[char.key]?.trim();
    if (!url) return;
    setCloneError(null);
    setCloningKey(char.key);
    try {
      const res = await fetch(`${API_BASE}/api/clone-voice-youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl: url, characterName: char.name }),
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

  const handleFileChange = (char: Character, file: File) => {
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
            characterName: char.name,
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
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
            Pick your{" "}
            <span className="bg-gradient-to-r from-violet-400 to-rose-400 bg-clip-text text-transparent">
              interviewer
            </span>
          </h1>
          <p className="text-gray-400 text-base max-w-md mx-auto">
            Each character has their own vibe. Upload an MP3 to clone their voice.
          </p>
        </div>

        {cloneError && (
          <p className="mb-8 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-xl px-4 py-3 max-w-md mx-auto text-center">
            {cloneError}
          </p>
        )}

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CHARACTERS.map((char, i) => {
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
                    <img src={char.img} alt={char.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
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
                      className="shrink-0 px-3 py-1.5 rounded-xl bg-red-600/80 hover:bg-red-500 text-white text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer"
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
                    Click to select →
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
