import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  interviews: defineTable({
    // Anonymous session UUID stored in the user's localStorage
    sessionId: v.string(),
    date: v.string(),
    jobTitle: v.string(),
    avgScore: v.number(),
    feedback: v.array(
      v.object({
        score: v.number(),
        critique: v.string(),
      })
    ),
    // Optional extra context stored alongside feedback
    questions: v.optional(v.array(v.string())),
    characterName: v.optional(v.string()),
  }).index("by_session", ["sessionId"]),
});
