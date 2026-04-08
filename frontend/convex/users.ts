import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

type AuthContext = {
  auth: {
    getUserIdentity: () => Promise<{
      tokenIdentifier: string;
      subject: string;
      name?: string;
      nickname?: string;
      email?: string;
      pictureUrl?: string;
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

export const upsertCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await getIdentityOrThrow(ctx);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    const patch = {
      authSubject: identity.subject,
      name: identity.name ?? identity.nickname ?? "MockCortex User",
      email: identity.email,
      pictureUrl: identity.pictureUrl,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return { ...existing, ...patch };
    }

    const id = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      freeInterviewUsed: false,
      interviewCredits: 0,
      ...patch,
    });

    return ctx.db.get(id);
  },
});

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
  },
});

export const consumeFreeInterview = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await getIdentityOrThrow(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) {
      throw new ConvexError("User profile not found");
    }

    const now = Date.now();
    const hasPro = typeof user.proUntil === "number" && user.proUntil > now;
    const hasCredits = user.interviewCredits > 0;

    if (hasPro) {
      return { allowed: true, reason: "pro" as const };
    }

    if (hasCredits) {
      await ctx.db.patch(user._id, {
        interviewCredits: user.interviewCredits - 1,
      });
      return { allowed: true, reason: "credit" as const };
    }

    if (user.freeInterviewUsed) {
      throw new ConvexError("Your one-time free interview has already been used.");
    }

    await ctx.db.patch(user._id, {
      freeInterviewUsed: true,
    });
    return { allowed: true, reason: "free" as const };
  },
});
