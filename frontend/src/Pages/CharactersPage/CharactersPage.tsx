import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "@/lib/api";

export const CHARACTERS = [
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "Skibidi Toilet",
    key: "skibidi",
    img: "https://images-ext-1.discordapp.net/external/Hap2lryvnginFongsyxwLoApIFGpEy9DQhWLM49y65Q/%3Fw%3D1600%26h%3D1600%26fit%3Dcrop/https/static0.thegamerimages.com/wordpress/wp-content/uploads/2025/11/a-screenshot-from-skibidi-toilet-showing-giant-toilets-with-a-mans-head-poking-out-3.jpg?format=webp&width=1221&height=1221",
    description: "High energy brainrot. Very rizz-focused.",
  },
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Trump",
    key: "trump",
    img: "https://images-ext-1.discordapp.net/external/O-fnPVcZNp2xui2WCKT9F4eVBV8Lm20lb3IwNsgfLdY/%3Fcrop%3D0.646xw%3A0.969xh%3B0.148xw%2C0%26resize%3D640%3A%2A/https/hips.hearstapps.com/hmg-prod/images/gettyimages-2194420718-67d9b4e326598.jpg?format=webp&width=960&height=960",
    description: "The best interviewer. Huge questions. Tremendous.",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Tung Tung Tung Sahur",
    key: "sahur",
    img: "https://play-lh.googleusercontent.com/blFJnPG3FC5gqUmZOMPT9cAY6T2dfteTNK5KlKnEoQKgXk1xJF9_pKqPy_vVKyjo_h9l=w240-h480-rw",
    description: "Wake up! Energy-filled Indonesian brainrot.",
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
    <div className="p-10 text-center bg-black min-h-screen text-white">
      <h1 className="text-4xl font-bold mb-4">Select Your Interviewer</h1>
      <p className="text-gray-400 text-sm mb-10">
        Upload an MP3 of a character's voice to clone it for a more authentic experience.
      </p>

      {cloneError && (
        <p className="mb-6 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-2 max-w-md mx-auto">
          {cloneError}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {CHARACTERS.map((char) => {
          const isCloning = cloningKey === char.key;
          const hasClone = Boolean(clonedVoices[char.key]);

          return (
            <div
              key={char.id}
              onClick={() => !isCloning && selectCharacter(char)}
              className="p-6 border-2 border-gray-800 rounded-2xl hover:border-blue-500 cursor-pointer transition-all bg-gray-900 group flex flex-col items-center"
            >
              <div className="w-32 h-32 mx-auto mb-4 rounded-full bg-gray-700 overflow-hidden group-hover:scale-110 transition-transform">
                <img src={char.img} alt={char.name} className="w-full h-full object-cover" />
              </div>

              <h2 className="text-2xl font-bold">{char.name}</h2>
              <p className="text-gray-400 mt-2 text-sm">{char.description}</p>

              {hasClone && !isCloning && (
                <span className="mt-3 text-xs bg-green-700/40 border border-green-600 text-green-400 px-3 py-1 rounded-full">
                  ✓ Custom voice active
                </span>
              )}
              {isCloning && (
                <span className="mt-3 text-xs text-yellow-400 flex items-center gap-1">
                  <span className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  Cloning voice…
                </span>
              )}

              <div
                className="mt-4 flex flex-col gap-2 w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => previewVoice(char)}
                  disabled={isCloning}
                  className="text-blue-400 underline text-sm disabled:opacity-40"
                >
                  Preview Voice
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
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                >
                  {hasClone ? "Replace Voice Sample" : "Upload Voice Sample"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CharactersPage;
