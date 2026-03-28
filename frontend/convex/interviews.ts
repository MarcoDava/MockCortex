import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Save a completed interview session to the database. */
export const addInterview = mutation({
  args: {
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
    questions: v.optional(v.array(v.string())),
    characterName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("interviews", args);
  },
});

/** Fetch all past interviews for a given anonymous session, newest first. */
export const getBySession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    return ctx.db
      .query("interviews")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .collect();
  },
});
