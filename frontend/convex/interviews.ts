import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Save a completed interview session to the database. */
export const addInterview = mutation({
  args: {
    sessionId: v.string(),
    date: v.string(),
    jobTitle: v.string(),
    avgScore: v.number(),
    lastAccessedAt: v.optional(v.number()),
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
    questions: v.optional(v.array(v.string())),
    interviewerName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("interviews", {
      ...args,
      lastAccessedAt: args.lastAccessedAt ?? Date.now(),
    });
  },
});

/** Generate a short-lived upload URL for Convex file storage. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return ctx.storage.generateUploadUrl();
  },
});

/** Resolve a storage id to a serving URL for browser playback. */
export const getFileUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    return ctx.storage.getUrl(storageId);
  },
});

/** Refresh inactivity timestamp for all sessions rows. */
export const touchSession = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const items = await ctx.db
      .query("interviews")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    await Promise.all(
      items.map((item) =>
        ctx.db.patch(item._id, {
          lastAccessedAt: Date.now(),
        })
      )
    );
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

/** Internal cron mutation to purge stale recordings and records. */
export const deleteInactiveInterviews = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const stale = await ctx.db
      .query("interviews")
      .withIndex("by_lastAccessedAt", (q) => q.lt("lastAccessedAt", cutoff))
      .collect();

    for (const interview of stale) {
      for (const answer of interview.answers ?? []) {
        if (answer.audioStorageId) {
          await ctx.storage.delete(answer.audioStorageId);
        }
      }
      await ctx.db.delete(interview._id);
    }

    return { deleted: stale.length };
  },
});
