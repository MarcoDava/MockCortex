import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    authSubject: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    pictureUrl: v.optional(v.string()),
    freeInterviewUsed: v.boolean(),
    interviewCredits: v.number(),
    proUntil: v.optional(v.number()),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_auth_subject", ["authSubject"]),
  interviews: defineTable({
    tokenIdentifier: v.optional(v.string()),
    date: v.string(),
    jobTitle: v.string(),
    avgScore: v.number(),
    lastAccessedAt: v.number(),
    feedback: v.array(
      v.object({
        score: v.number(),
        critique: v.string(),
      })
    ),
    answers: v.optional(
      v.array(
        v.object({
          question: v.string(),
          answer: v.string(),
          audioUrl: v.optional(v.string()),
          audioStorageId: v.optional(v.id("_storage")),
          emotionTimeline: v.optional(
            v.array(
              v.object({
                ts: v.number(),
                emotion: v.string(),
                confidence: v.number(),
              })
            )
          ),
        })
      )
    ),
    // Optional extra context stored alongside feedback
    questions: v.optional(v.array(v.string())),
    interviewerName: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_lastAccessedAt", ["lastAccessedAt"])
    .index("by_session", ["sessionId"]),
});
