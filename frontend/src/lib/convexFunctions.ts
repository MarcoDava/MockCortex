/**
 * Type-safe Convex function references that work WITHOUT needing to run
 * `npx convex dev` first. Generated files in convex/_generated/ will
 * override these with stricter types after `npx convex deploy`.
 */
import { makeFunctionReference } from "convex/server";
import type { Feedback, SessionResult } from "@/types";

export interface StoredInterview {
  _id: string;
  _creationTime: number;
  sessionId: string;
  date: string;
  jobTitle: string;
  avgScore: number;
  lastAccessedAt: number;
  feedback: Feedback[];
  answers?: SessionResult[];
  questions?: string[];
  interviewerName?: string;
}

export const convexAddInterview = makeFunctionReference<
  "mutation",
  {
    sessionId: string;
    date: string;
    jobTitle: string;
    avgScore: number;
    lastAccessedAt?: number;
    feedback: Feedback[];
    answers?: SessionResult[];
    questions?: string[];
    interviewerName?: string;
  },
  null
>("interviews:addInterview");

export const convexGetBySession = makeFunctionReference<
  "query",
  { sessionId: string },
  StoredInterview[]
>("interviews:getBySession");

export const convexGenerateUploadUrl = makeFunctionReference<
  "mutation",
  Record<string, never>,
  string
>("interviews:generateUploadUrl");

export const convexGetFileUrl = makeFunctionReference<
  "mutation",
  { storageId: string },
  string | null
>("interviews:getFileUrl");

export const convexTouchSession = makeFunctionReference<
  "mutation",
  { sessionId: string },
  null
>("interviews:touchSession");
