import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Delete interviews and related recordings after 5 days of inactivity.
crons.daily("purge stale interviews", { hourUTC: 3, minuteUTC: 0 }, internal.interviews.deleteInactiveInterviews, {});

export default crons;
