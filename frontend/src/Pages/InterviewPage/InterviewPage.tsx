import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "@/lib/api";
import type { Question, Character } from "@/types";

type Phase = "loading" | "speaking" | "countdown" | "recording" | "silent" | "interrupted";

// Webkit Speech Recognition type
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
}

const InterviewPage = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [transcript, setTranscript] = useState("");
  const [phase, setPhase] = useState<Phase>("loading");
  const [countdown, setCountdown] = useState(3);
  const [timer, setTimer] = useState(120);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [character, setCharacter] = useState<Character | null>(null);
  const [interruptMsg, setInterruptMsg] = useState("");

  const navigate = useNavigate();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const emotionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpeechRef = useRef<number>(Date.now());

  // Load character + questions from localStorage
  useEffect(() => {
    const savedChar = localStorage.getItem("selectedCharacter");
    if (savedChar) setCharacter(JSON.parse(savedChar) as Character);

    const saved = localStorage.getItem("interviewQuestions");
    if (saved) {
      setQuestions(JSON.parse(saved) as Question[]);
      setPhase("speaking");
    }
  }, []);

  // Start webcam
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        // Camera unavailable — interview continues without it
      });

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Capture a frame from the webcam as base64 JPEG
  const captureFrame = (): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    canvas.getContext("2d")?.drawImage(video, 0, 0, 320, 240);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
    return dataUrl.split(",")[1] ?? null; // strip prefix
  };

  // Analyze emotion via backend every 15 s during recording
  useEffect(() => {
    if (phase === "recording") {
      emotionIntervalRef.current = setInterval(async () => {
        const imageBase64 = captureFrame();
        if (!imageBase64) return;
        const voiceId = character?.id ?? "";
        try {
          const res = await fetch(`${API_BASE}/api/analyze-emotion`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64, voiceId }),
          });
          if (!res.ok) return;
          const data = (await res.json()) as { emotion: string; shouldInterrupt: boolean; message: string };
          if (data.shouldInterrupt) {
            clearInterval(emotionIntervalRef.current!);
            clearInterval(silenceIntervalRef.current!);
            recognitionRef.current?.stop();
            setInterruptMsg(data.message);
            setPhase("interrupted");
          }
        } catch {
          // Non-fatal
        }
      }, 15000);
    } else {
      if (emotionIntervalRef.current) {
        clearInterval(emotionIntervalRef.current);
        emotionIntervalRef.current = null;
      }
    }
    return () => {
      if (emotionIntervalRef.current) clearInterval(emotionIntervalRef.current);
    };
  }, [phase, character]);

  // Silence detection: >10 s without speech during recording
  useEffect(() => {
    if (phase === "recording") {
      lastSpeechRef.current = Date.now();
      silenceIntervalRef.current = setInterval(() => {
        if (Date.now() - lastSpeechRef.current > 10000) {
          clearInterval(silenceIntervalRef.current!);
          clearInterval(emotionIntervalRef.current!);
          recognitionRef.current?.stop();
          setPhase("silent");
        }
      }, 1000);
    } else {
      if (silenceIntervalRef.current) {
        clearInterval(silenceIntervalRef.current);
        silenceIntervalRef.current = null;
      }
    }
    return () => {
      if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current);
    };
  }, [phase]);

  const playAIQuestion = useCallback(
    async (text: string) => {
      if (!character) return;
      setIsSpeaking(true);
      try {
        const res = await fetch(`${API_BASE}/api/ask-question`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text, voiceId: character.id }),
        });
        if (!res.ok) throw new Error("Audio fetch failed");
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.onended = () => {
          setIsSpeaking(false);
          setPhase("countdown");
        };
        audio.play();
      } catch {
        setIsSpeaking(false);
        setPhase("countdown");
      }
    },
    [character]
  );

  // Auto-play question when phase becomes "speaking"
  useEffect(() => {
    if (phase === "speaking" && questions[currentIdx]) {
      playAIQuestion(questions[currentIdx].question);
    }
  }, [currentIdx, phase, questions, playAIQuestion]);

  // 3-second countdown before recording
  useEffect(() => {
    if (phase === "countdown") {
      if (countdown > 0) {
        const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
        return () => clearTimeout(id);
      } else {
        setPhase("recording");
        startRecording();
      }
    }
  }, [phase, countdown]);

  // 2-minute recording timer
  useEffect(() => {
    if (phase === "recording" && timer > 0) {
      const id = setTimeout(() => setTimer((t) => t - 1), 1000);
      return () => clearTimeout(id);
    } else if (phase === "recording" && timer === 0) {
      handleNext();
    }
  }, [phase, timer]);

  const startRecording = () => {
    const SR = (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event: SpeechRecognitionEvent) => {
      lastSpeechRef.current = Date.now();
      const result = event.results[event.results.length - 1];
      if (result) setTranscript(result[0]?.transcript ?? "");
    };
    rec.onerror = () => {/* non-fatal */};
    recognitionRef.current = rec;
    rec.start();
  };

  const handleNext = useCallback(() => {
    recognitionRef.current?.stop();
    clearInterval(emotionIntervalRef.current!);
    clearInterval(silenceIntervalRef.current!);
    const newAnswers = [
      ...answers,
      { question: questions[currentIdx]?.question ?? "", answer: transcript },
    ];
    if (currentIdx < questions.length - 1) {
      setAnswers(newAnswers);
      setCurrentIdx((i) => i + 1);
      setTranscript("");
      setCountdown(3);
      setTimer(120);
      setPhase("speaking");
    } else {
      localStorage.setItem("sessionResults", JSON.stringify(newAnswers));
      streamRef.current?.getTracks().forEach((t) => t.stop());
      navigate("/feedback");
    }
  }, [answers, currentIdx, questions, transcript, navigate]);

  const resumeRecording = () => {
    setTranscript("");
    setCountdown(3);
    setPhase("countdown");
  };

  const endInterview = useCallback(() => {
    recognitionRef.current?.stop();
    clearInterval(emotionIntervalRef.current!);
    clearInterval(silenceIntervalRef.current!);
    const newAnswers = [
      ...answers,
      { question: questions[currentIdx]?.question ?? "", answer: transcript },
    ];
    localStorage.setItem("sessionResults", JSON.stringify(newAnswers));
    streamRef.current?.getTracks().forEach((t) => t.stop());
    navigate("/feedback");
  }, [answers, currentIdx, questions, transcript, navigate]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  if (!questions.length) {
    return (
      <div className="flex items-center justify-center h-screen text-white text-xl">
        Loading Interview...
      </div>
    );
  }

  const q = questions[currentIdx];

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 text-white pointer-events-auto">
      <div className="max-w-3xl w-full">
        {/* Header */}
        <p className="text-center text-gray-400 mb-2 text-sm">
          Question {currentIdx + 1} of {questions.length}
        </p>
        <h1 className="text-2xl font-bold text-center mb-8">{q?.question}</h1>

        {/* Two-column: character | camera */}
        <div className="flex gap-6 justify-center items-start mb-8">
          {/* Character */}
          {character && (
            <div className="relative flex flex-col items-center">
              <img
                src={character.img}
                alt={character.name}
                className={`w-40 h-40 rounded-full border-4 object-cover transition-all duration-150 ${
                  isSpeaking
                    ? "border-yellow-400 scale-105 animate-pulse"
                    : "border-gray-700"
                }`}
              />
              {isSpeaking && (
                <span className="mt-2 bg-yellow-500 text-black px-3 py-0.5 rounded-full text-xs font-bold">
                  {character.name.toUpperCase()} IS TALKING…
                </span>
              )}
            </div>
          )}

          {/* Webcam feed */}
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-48 h-36 rounded-xl border-2 border-gray-700 object-cover bg-gray-900"
            />
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs text-gray-400 bg-black/60 px-2 py-0.5 rounded">
              You
            </span>
          </div>
        </div>

        {/* Phase UI */}
        {phase === "speaking" && (
          <p className="text-center animate-pulse text-blue-400 text-lg">
            Interviewer is speaking…
          </p>
        )}

        {phase === "countdown" && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-gray-400 text-sm">Get ready to answer in…</p>
            <div className="w-24 h-24 rounded-full border-4 border-yellow-400 flex items-center justify-center text-6xl font-bold text-yellow-400">
              {countdown}
            </div>
          </div>
        )}

        {phase === "recording" && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 font-mono text-xl font-bold">
                {formatTime(timer)}
              </span>
            </div>
            <div className="p-5 border border-red-500 rounded-xl bg-red-900/20 min-h-[80px]">
              <p className="italic text-gray-200">
                "{transcript || "Listening…"}"
              </p>
            </div>
            <div className="flex justify-center">
              <button
                onClick={handleNext}
                className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-gray-200 transition-colors"
              >
                Submit Answer
              </button>
            </div>
          </div>
        )}

        {/* Silence modal */}
        {phase === "silent" && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
              <p className="text-2xl">🤫</p>
              <h2 className="text-xl font-bold">Are you still there?</h2>
              <p className="text-gray-400 text-sm">
                No speech detected for 10 seconds.
              </p>
              <div className="flex gap-3 justify-center pt-2">
                <button
                  onClick={resumeRecording}
                  className="bg-blue-600 text-white px-6 py-2 rounded-full font-semibold hover:bg-blue-500 transition-colors"
                >
                  Continue Recording
                </button>
                <button
                  onClick={endInterview}
                  className="bg-gray-700 text-white px-6 py-2 rounded-full font-semibold hover:bg-gray-600 transition-colors"
                >
                  End Interview
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Interrupt modal */}
        {phase === "interrupted" && character && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-yellow-600 rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
              <img
                src={character.img}
                alt={character.name}
                className="w-20 h-20 rounded-full border-4 border-yellow-400 mx-auto object-cover"
              />
              <h2 className="text-lg font-bold text-yellow-400">
                {character.name} interrupted!
              </h2>
              <p className="text-gray-200 italic">"{interruptMsg}"</p>
              <div className="flex gap-3 justify-center pt-2">
                <button
                  onClick={resumeRecording}
                  className="bg-yellow-500 text-black px-6 py-2 rounded-full font-semibold hover:bg-yellow-400 transition-colors"
                >
                  Continue
                </button>
                <button
                  onClick={endInterview}
                  className="bg-gray-700 text-white px-6 py-2 rounded-full font-semibold hover:bg-gray-600 transition-colors"
                >
                  End Interview
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InterviewPage;
