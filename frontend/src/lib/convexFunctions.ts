/**
 * Type-safe Convex function references that work WITHOUT needing to run
 * `npx convex dev` first. Generated files in convex/_generated/ will
 * override these with stricter types after `npx convex deploy`.
 */
import { makeFunctionReference } from "convex/server";
import type { Feedback, SessionResult, UserAccount } from "@/types";

export interface StoredInterview {
  _id: string;
  _creationTime: number;
  tokenIdentifier?: string;
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

export const convexGetMyInterviews = makeFunctionReference<
  "query",
  Record<string, never>,
  StoredInterview[]
>("interviews:getMyInterviews");

export const convexTouchMyInterviews = makeFunctionReference<
  "mutation",
  Record<string, never>,
  null
>("interviews:touchMyInterviews");

export const convexUpsertCurrentUser = makeFunctionReference<
  "mutation",
  Record<string, never>,
  UserAccount | null
>("users:upsertCurrentUser");

export const convexCurrentUser = makeFunctionReference<
  "query",
  Record<string, never>,
  UserAccount | null
>("users:currentUser");

export const convexConsumeFreeInterview = makeFunctionReference<
  "mutation",
  Record<string, never>,
  { allowed: true; reason: "free" | "credit" | "pro" }
>("users:consumeFreeInterview");
