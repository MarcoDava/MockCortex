import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import { API_BASE } from "@/lib/api";
import { convexGenerateUploadUrl, convexGetFileUrl } from "@/lib/convexFunctions";
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
  const generateUploadUrl = useMutation(convexGenerateUploadUrl);
  const getFileUrl = useMutation(convexGetFileUrl);

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
    const hasAudio = stream.getAudioTracks().length > 0;
    if (!hasAudio) return;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "audio/mp4";

    recordedChunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) recordedChunksRef.current.push(event.data);
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
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

  const uploadAnswerAudio = useCallback(
    async (blob: Blob): Promise<{ audioUrl?: string; audioStorageId?: string }> => {
      try {
        const uploadUrl = await generateUploadUrl({});
        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": blob.type || "audio/webm" },
          body: blob,
        });
        if (!uploadRes.ok) return {};
        const { storageId } = (await uploadRes.json()) as { storageId?: string };
        if (!storageId) return {};
        const resolvedUrl = await getFileUrl({ storageId });
        return {
          audioStorageId: storageId,
          audioUrl: resolvedUrl ?? undefined,
        };
      } catch {
        return {};
      }
    },
    [generateUploadUrl, getFileUrl]
  );

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
    startEmotionTracking();
    rec.start();
  };

  const finalizeAnswer = useCallback(async (): Promise<SessionResult> => {
    recognitionRef.current?.stop();
    stopEmotionTracking();
    clearInterval(silenceIntervalRef.current!);

    const blob = await stopAudioRecorder();
    const uploadMeta = blob ? await uploadAnswerAudio(blob) : {};

    return {
      question: questions[currentIdx]?.question ?? "",
      answer: transcript,
      ...uploadMeta,
      emotionTimeline: answerTimelineRef.current,
    };
  }, [currentIdx, questions, stopAudioRecorder, stopEmotionTracking, transcript, uploadAnswerAudio]);

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

        {/* Phase UI */}
        {phase === "speaking" && (
          <p className="text-center animate-pulse text-blue-400 text-lg">
            Interviewer is speaking...
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
              <span className="text-xs uppercase tracking-wide text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded-full">
                emotion: {currentEmotion}
              </span>
            </div>
            <div className="p-5 border border-red-500 rounded-xl bg-red-900/20 min-h-[80px]">
              <p className="italic text-gray-200">
                "{transcript || "Listening..."}"
              </p>
            </div>
            <div className="flex justify-center">
              <button
                onClick={() => void handleNext()}
                disabled={isSubmitting}
                className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-gray-200 transition-colors disabled:opacity-60"
              >
                {isSubmitting ? "Saving..." : "Submit Answer"}
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
                  onClick={() => void endInterview()}
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
