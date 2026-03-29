/**
 * Type-safe Convex function references that work WITHOUT needing to run
 * `npx convex dev` first. Generated files in convex/_generated/ will
 * override these with stricter types after `npx convex deploy`.
 */
import { makeFunctionReference } from "convex/server";
import type { Feedback } from "@/types";

export interface StoredInterview {
  _id: string;
  _creationTime: number;
  sessionId: string;
  date: string;
  jobTitle: string;
  avgScore: number;
  feedback: Feedback[];
  questions?: string[];
  characterName?: string;
}

export const convexAddInterview = makeFunctionReference<
  "mutation",
  {
    sessionId: string;
    date: string;
    jobTitle: string;
    avgScore: number;
    feedback: Feedback[];
    questions?: string[];
    characterName?: string;
  },
  null
>("interviews:addInterview");

export const convexGetBySession = makeFunctionReference<
  "query",
  { sessionId: string },
  StoredInterview[]
>("interviews:getBySession");
