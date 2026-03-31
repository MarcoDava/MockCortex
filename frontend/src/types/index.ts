export interface Question {
  question: string;
  type: string;
}

export interface Feedback {
  score: number;
  critique: string;
}

export interface SessionResult {
  question: string;
  answer: string;
  audioUrl?: string;
  audioStorageId?: string;
  emotionTimeline?: EmotionSample[];
}

export interface InterviewSession {
  date: string;
  jobTitle: string;
  avgScore: number;
  feedback: Feedback[];
  answers?: SessionResult[];
}

export interface Character {
  id: string;
  name: string;
  description: string;
  img: string;
}

export interface EmotionSample {
  ts: number;
  emotion: string;
  confidence: number;
}

export interface EmotionResult {
  emotion: string;
  shouldInterrupt: boolean;
  message: string;
}

export interface ResumeSummary {
  name?: string;
  skills: string[];
  experience: string;
  education?: string;
  highlights?: string[];
}

export interface BrainRegion {
  name: string;
  activation: number;
}

export interface NeuralResult {
  score: number;
  brainImageBase64: string;
  regions: BrainRegion[];
}

export interface NeuralEngagementResponse {
  available: boolean;
  pending: boolean;
  results: NeuralResult[] | null;
  interpretation?: string;
}
