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
}

export interface InterviewSession {
  date: string;
  jobTitle: string;
  avgScore: number;
  feedback: Feedback[];
}

export interface Character {
  id: string;
  name: string;
  description: string;
  img: string;
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
