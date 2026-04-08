import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "convex/react";
import { convexCurrentUser } from "@/lib/convexFunctions";

const SignInPage = () => {
  const location = useLocation();
  const { isAuthenticated, isLoading, loginWithRedirect, logout } = useAuth0();
  const currentUser = useQuery(convexCurrentUser, {});

  const next = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const requested = params.get("next");
    return requested && requested.startsWith("/") ? requested : "/characters";
  }, [location.search]);

  const handleSignIn = async () => {
    await loginWithRedirect({
      appState: { returnTo: next },
    });
  };

  const hasFreeInterview = Boolean(currentUser && !currentUser.freeInterviewUsed);

  return (
    <div className="pointer-events-auto">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="ink-panel editorial-grid overflow-hidden p-8">
          <div className="space-y-6">
            <span className="inline-flex items-center rounded-full border border-white/12 bg-white/6 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.28em] text-[rgba(235,205,181,0.72)]">
              Account access
            </span>
            <div className="space-y-3">
              <h1 className="section-title text-white">Sign in once. Use the free session well.</h1>
              <p className="text-sm leading-7 text-slate-300">
                Every account gets one free interview session. After that, credits or Pro can unlock more rehearsals without changing the core workflow.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="rounded-[24px] border border-white/8 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white">What the free session includes</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Generated questions, a voiced interviewer, timed answers, recording capture, and AI feedback with session history.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white">Why sign-in matters</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Your archive and entitlements are now tied to your authenticated account instead of a browser-only session.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="surface-panel-strong p-8">
          <div className="mx-auto max-w-md space-y-6">
            <div className="space-y-3">
              <span className="eyebrow">MockCortex access</span>
              <h2 className="section-title text-slate-950">Enter the rehearsal room.</h2>
              <p className="body-muted">
                Sign in to unlock your account state, keep your session archive, and start your first interview.
              </p>
            </div>

            <div className="rounded-[24px] border border-[rgba(42,59,78,0.12)] bg-white/80 p-4">
              <p className="text-sm font-semibold text-slate-900">Account status</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {currentUser === undefined
                  ? "We will sync your account as soon as Auth0 finishes loading."
                  : hasFreeInterview
                    ? "Your free session is available."
                    : isAuthenticated
                      ? "Your free session has already been used."
                      : "One free session is waiting after sign-in."}
              </p>
            </div>

            {isAuthenticated ? (
              <div className="space-y-3">
                <Link to={next} className="primary-button w-full">
                  Continue to interviewers
                </Link>
                <button
                  onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                  className="secondary-button w-full"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => void handleSignIn()}
                disabled={isLoading}
                className="primary-button w-full disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Loading..." : "Sign in with Auth0"}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default SignInPage;
