import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

type AuthContext = {
  auth: {
    getUserIdentity: () => Promise<{
      tokenIdentifier: string;
    } | null>;
  };
};

async function getIdentityOrThrow(ctx: AuthContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Not authenticated");
  }
  return identity;
}

export const addInterview = mutation({
  args: {
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
    const identity = await getIdentityOrThrow(ctx);
    await ctx.db.insert("interviews", {
      tokenIdentifier: identity.tokenIdentifier,
      date: args.date,
      jobTitle: args.jobTitle,
      avgScore: args.avgScore,
      lastAccessedAt: args.lastAccessedAt ?? Date.now(),
      feedback: args.feedback,
      answers: args.answers,
      questions: args.questions,
      interviewerName: args.interviewerName,
    });
  },
});

export const getMyInterviews = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getIdentityOrThrow(ctx);
    return ctx.db
      .query("interviews")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .order("desc")
      .collect();
  },
});

export const touchMyInterviews = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await getIdentityOrThrow(ctx);
    const items = await ctx.db
      .query("interviews")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
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
