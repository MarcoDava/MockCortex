import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { apiFetch } from "@/lib/api";
import { storeVideoBlob } from "@/lib/videoStore";
import type { Character, EmotionSample, Question, SessionResult } from "@/types";

type Phase = "loading" | "speaking" | "countdown" | "recording" | "silent";

// Webkit Speech Recognition type
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface FaceLandmarkerResult {
  faceBlendshapes?: Array<{
    categories: Array<{ categoryName: string; score: number }>;
  }>;
}

const InterviewPage = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<SessionResult[]>([]);
  const [transcript, setTranscript] = useState("");
  const [phase, setPhase] = useState<Phase>("loading");
  const [countdown, setCountdown] = useState(3);
  const [timer, setTimer] = useState(120);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [character, setCharacter] = useState<Character | null>(null);
  const [currentEmotion, setCurrentEmotion] = useState("neutral");

  const navigate = useNavigate();

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const faceLandmarkerRef = useRef<{ detectForVideo: (video: HTMLVideoElement, timestamp: number) => FaceLandmarkerResult } | null>(null);
  const emotionFrameRef = useRef<number | null>(null);
  const lastEmotionSampleRef = useRef(0);
  const answerTimelineRef = useRef<EmotionSample[]>([]);
  const recordingStartRef = useRef<number>(0);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpeechRef = useRef<number>(Date.now());
  const videoChunksRef = useRef<Blob[]>([]);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);

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
      .getUserMedia({ video: true, audio: true })
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

  // Load MediaPipe Face Landmarker once for continuous in-browser emotion estimation.
  useEffect(() => {
    let cancelled = false;

    const loadFaceLandmarker = async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const filesetResolver = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const landmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        });
        if (!cancelled) {
          faceLandmarkerRef.current = landmarker;
        }
      } catch {
        faceLandmarkerRef.current = null;
      }
    };

    void loadFaceLandmarker();

    return () => {
      cancelled = true;
    };
  }, []);

  const emotionFromBlendshapes = useCallback((categories: Array<{ categoryName: string; score: number }>) => {
    const scoreOf = (name: string) => categories.find((c) => c.categoryName === name)?.score ?? 0;
    const smile = (scoreOf("mouthSmileLeft") + scoreOf("mouthSmileRight")) / 2;
    const frown = (scoreOf("mouthFrownLeft") + scoreOf("mouthFrownRight")) / 2;
    const surprise = (scoreOf("eyeWideLeft") + scoreOf("eyeWideRight") + scoreOf("jawOpen")) / 3;
    const focus = (scoreOf("browDownLeft") + scoreOf("browDownRight") + scoreOf("eyeSquintLeft") + scoreOf("eyeSquintRight")) / 4;

    if (smile > 0.45) return { emotion: "confident", confidence: smile };
    if (surprise > 0.5) return { emotion: "surprised", confidence: surprise };
    if (frown > 0.4) return { emotion: "stressed", confidence: frown };
    if (focus > 0.4) return { emotion: "focused", confidence: focus };
    return { emotion: "neutral", confidence: 0.35 };
  }, []);

  const stopEmotionTracking = useCallback(() => {
    if (emotionFrameRef.current != null) {
      cancelAnimationFrame(emotionFrameRef.current);
      emotionFrameRef.current = null;
    }
  }, []);

  const startEmotionTracking = useCallback(() => {
    stopEmotionTracking();
    const landmarker = faceLandmarkerRef.current;
    const video = videoRef.current;
    if (!landmarker || !video) return;

    const tick = () => {
      if (phase !== "recording") return;
      if (video.readyState >= 2) {
        const result = landmarker.detectForVideo(video, performance.now());
        const categories = result.faceBlendshapes?.[0]?.categories;
        if (categories?.length) {
          const sample = emotionFromBlendshapes(categories);
          setCurrentEmotion(sample.emotion);

          const now = Date.now();
          if (now - lastEmotionSampleRef.current > 1000) {
            answerTimelineRef.current.push({
              ts: Math.max(0, now - recordingStartRef.current),
              emotion: sample.emotion,
              confidence: Number(sample.confidence.toFixed(3)),
            });
            lastEmotionSampleRef.current = now;
          }
        }
      }
      emotionFrameRef.current = requestAnimationFrame(tick);
    };

    emotionFrameRef.current = requestAnimationFrame(tick);
  }, [emotionFromBlendshapes, phase, stopEmotionTracking]);

  const startAudioRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    // Use an audio-only stream — passing a mixed video+audio stream can throw NotSupportedError
    const audioStream = new MediaStream(audioTracks);

    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t));

    try {
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
    } catch {
      // Recording not supported in this browser — interview continues without audio capture
    }
  }, []);

  const stopAudioRecorder = useCallback(async (): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return null;

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = recordedChunksRef.current.length
          ? new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" })
          : null;
        mediaRecorderRef.current = null;
        recordedChunksRef.current = [];
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  const startVideoRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !stream.getVideoTracks().length) return;
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t));
    try {
      videoChunksRef.current = [];
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType, videoBitsPerSecond: 600_000 } : undefined
      );
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };
      recorder.start(1000);
      videoRecorderRef.current = recorder;
    } catch {
      // video recording unsupported — continue without it
    }
  }, []);

  const stopVideoRecorder = useCallback((questionIndex: number): Promise<void> => {
    const recorder = videoRecorderRef.current;
    if (!recorder) return Promise.resolve();
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = videoChunksRef.current.length
          ? new Blob(videoChunksRef.current, { type: recorder.mimeType || "video/webm" })
          : null;
        videoRecorderRef.current = null;
        videoChunksRef.current = [];
        if (blob) storeVideoBlob(questionIndex, URL.createObjectURL(blob));
        resolve();
      };
      recorder.stop();
    });
  }, []);

  // Silence detection: >10 s without speech during recording
  useEffect(() => {
    if (phase === "recording") {
      lastSpeechRef.current = Date.now();
      silenceIntervalRef.current = setInterval(() => {
        if (Date.now() - lastSpeechRef.current > 10000) {
          clearInterval(silenceIntervalRef.current!);
          stopEmotionTracking();
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
  }, [phase, stopEmotionTracking]);

  const playAIQuestion = useCallback(
    async (text: string) => {
      if (!character) return;
      setIsSpeaking(true);
      try {
        const res = await apiFetch(`/api/ask-question`, {
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
      void handleNext();
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
    rec.onend = null;
    recognitionRef.current = rec;
    recordingStartRef.current = Date.now();
    answerTimelineRef.current = [];
    lastEmotionSampleRef.current = 0;
    setCurrentEmotion("neutral");
    startAudioRecorder();
    startVideoRecorder();
    startEmotionTracking();
    rec.start();
  };

  const finalizeAnswer = useCallback(async (): Promise<SessionResult> => {
    recognitionRef.current?.stop();
    stopEmotionTracking();
    clearInterval(silenceIntervalRef.current!);

    const [blob] = await Promise.all([
      stopAudioRecorder(),
      stopVideoRecorder(currentIdx),
    ]);
    if (blob) {
      void blob;
    }

    return {
      question: questions[currentIdx]?.question ?? "",
      answer: transcript,
      emotionTimeline: answerTimelineRef.current,
    };
  }, [currentIdx, questions, stopAudioRecorder, stopVideoRecorder, stopEmotionTracking, transcript]);

  const handleNext = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const newAnswer = await finalizeAnswer();
    const newAnswers = [...answers, newAnswer];

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
    setIsSubmitting(false);
  }, [answers, currentIdx, finalizeAnswer, isSubmitting, navigate, questions.length]);

  const resumeRecording = () => {
    setTranscript("");
    setCountdown(3);
    setPhase("countdown");
  };

  const endInterview = useCallback(async () => {
    const newAnswer = await finalizeAnswer();
    const newAnswers = [...answers, newAnswer];
    localStorage.setItem("sessionResults", JSON.stringify(newAnswers));
    streamRef.current?.getTracks().forEach((t) => t.stop());
    navigate("/feedback");
  }, [answers, finalizeAnswer, navigate]);

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
                  {character.name.toUpperCase()} IS TALKING...
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

        {/* Phase UI — wrapped in AnimatePresence for smooth transitions */}
        <AnimatePresence mode="wait">
          {phase === "speaking" && (
            <motion.div
              key="speaking"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center gap-3 py-4"
            >
              <div className="flex items-end gap-1 h-8">
                {[0.4, 0.7, 1, 0.7, 0.5, 0.8, 0.6, 0.9, 0.4].map((h, i) => (
                  <div
                    key={i}
                    className="w-1 bg-violet-400 rounded-full animate-pulse"
                    style={{ height: `${h * 100}%`, animationDelay: `${i * 80}ms`, animationDuration: "900ms" }}
                  />
                ))}
              </div>
              <p className="text-gray-400 text-sm">{character?.name} is speaking…</p>
            </motion.div>
          )}

          {phase === "countdown" && (
            <motion.div
              key="countdown"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center gap-4"
            >
              <p className="text-gray-400 text-sm tracking-wide">Get ready to answer in</p>
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r="44" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                  <circle
                    cx="48" cy="48" r="44" fill="none"
                    stroke="rgb(139,92,246)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 44}`}
                    strokeDashoffset={`${2 * Math.PI * 44 * (1 - countdown / 3)}`}
                    className="transition-all duration-1000 ease-linear"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-5xl font-black text-white tabular-nums">{countdown}</span>
                </div>
              </div>
              <p className="text-violet-400 text-xs">Your answer will be recorded</p>
            </motion.div>
          )}

          {phase === "recording" && (
            <motion.div
              key="recording"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4 w-full"
            >
              {/* Status bar */}
              <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-red-500/8 border border-red-500/20">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                  </span>
                  <span className="text-red-400 text-xs font-semibold uppercase tracking-wider">Recording</span>
                </div>
                <span className="font-mono text-white text-sm font-bold tabular-nums">{formatTime(timer)}</span>
                <span className="text-xs text-gray-500 font-medium capitalize">{currentEmotion}</span>
              </div>

              {/* Transcript box */}
              <div className="min-h-[100px] p-5 rounded-2xl bg-white/4 border border-white/8 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <motion.p
                  key={transcript.slice(-20)}
                  initial={{ opacity: 0.7 }}
                  animate={{ opacity: 1 }}
                  className={`text-base leading-relaxed transition-colors duration-300 ${transcript ? "text-gray-100" : "text-gray-600 italic"}`}
                >
                  {transcript || "Listening for your answer…"}
                </motion.p>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={() => void handleNext()}
                  disabled={isSubmitting}
                  className="px-8 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Saving…" : currentIdx < questions.length - 1 ? "Next Question" : "Finish Interview"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Silence modal */}
        <AnimatePresence>
          {phase === "silent" && (
            <motion.div
              key="silence"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="bg-white/6 backdrop-blur-xl border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_80px_rgba(0,0,0,0.6)]"
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto">
                  <span className="text-amber-400 text-xl">⏸</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Still there?</h2>
                  <p className="text-gray-400 text-sm mt-1">No speech detected for 10 seconds.</p>
                </div>
                <div className="flex gap-3 justify-center pt-1">
                  <button
                    onClick={resumeRecording}
                    className="px-6 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors"
                  >
                    Continue
                  </button>
                  <button
                    onClick={() => void endInterview()}
                    className="px-6 py-2.5 rounded-2xl bg-white/8 hover:bg-white/12 border border-white/10 text-gray-300 font-semibold text-sm transition-colors"
                  >
                    End Interview
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default InterviewPage;
