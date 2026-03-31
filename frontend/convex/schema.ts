import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  interviews: defineTable({
    // Anonymous session UUID stored in the user's localStorage
    sessionId: v.string(),
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
  })
    .index("by_session", ["sessionId"])
    .index("by_lastAccessedAt", ["lastAccessedAt"]),
});
