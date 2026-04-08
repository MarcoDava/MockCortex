import { useState } from "react";
import { Link, useLocation } from "react-router";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { convexCurrentUser } from "@/lib/convexFunctions";
import logo from "../assets/logo.png";

const links = [
  { to: "/", label: "Overview" },
  { to: "/characters", label: "Interviewers" },
  { to: "/pastinterviews", label: "Session Archive" },
];

const Navbar = () => {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { isAuthenticated, loginWithRedirect, logout } = useAuth0();
  const currentUser = useQuery(convexCurrentUser, {});

  const canUseFreeInterview = Boolean(currentUser && !currentUser.freeInterviewUsed);
  const statusLabel =
    currentUser === undefined
      ? "Syncing account"
      : canUseFreeInterview
        ? "1 free session available"
        : "Free session redeemed";

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="fixed left-0 right-0 top-0 z-50 px-4 pt-4 sm:px-6"
    >
      <div className="mx-auto max-w-6xl rounded-[28px] border border-[rgba(107,83,57,0.16)] bg-[rgba(255,251,244,0.86)] px-4 py-3 shadow-[0_18px_70px_rgba(87,58,32,0.08)] backdrop-blur-xl sm:px-5">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="MockCortex logo" className="h-11 w-11 rounded-2xl object-cover shadow-[0_10px_24px_rgba(15,23,42,0.14)]" />
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[rgb(154,77,37)]">MockCortex</p>
              <p className="text-sm font-medium text-slate-700">Interview studio for serious practice</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {links.map(({ to, label }) => {
              const active = pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-[rgba(24,40,58,0.92)] text-white"
                      : "text-slate-600 hover:bg-[rgba(24,40,58,0.06)] hover:text-slate-900"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            {isAuthenticated && (
              <div className="rounded-full border border-[rgba(42,59,78,0.12)] bg-white/70 px-4 py-2 text-right">
                <p className="text-sm font-semibold text-slate-800">{currentUser?.name ?? "Signed in"}</p>
                <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{statusLabel}</p>
              </div>
            )}

            {isAuthenticated ? (
              <button
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                className="secondary-button"
              >
                Sign Out
              </button>
            ) : (
              <button
                onClick={() => void loginWithRedirect({ appState: { returnTo: "/characters" } })}
                className="primary-button"
              >
                Sign In
              </button>
            )}
          </div>

          <button
            onClick={() => setMenuOpen((value) => !value)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(42,59,78,0.12)] bg-white/80 text-slate-800 md:hidden"
            aria-label="Toggle menu"
          >
            <div className="flex flex-col gap-1.5">
              <span className={`block h-0.5 w-5 bg-current transition-transform ${menuOpen ? "translate-y-2 rotate-45" : ""}`} />
              <span className={`block h-0.5 w-5 bg-current transition-opacity ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`block h-0.5 w-5 bg-current transition-transform ${menuOpen ? "-translate-y-2 -rotate-45" : ""}`} />
            </div>
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden md:hidden"
            >
              <div className="mt-4 space-y-3 border-t border-[rgba(107,83,57,0.14)] pt-4">
                <div className="grid gap-2">
                  {links.map(({ to, label }) => {
                    const active = pathname === to;
                    return (
                      <Link
                        key={to}
                        to={to}
                        onClick={() => setMenuOpen(false)}
                        className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                          active
                            ? "bg-[rgba(24,40,58,0.92)] text-white"
                            : "bg-white/70 text-slate-700"
                        }`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>

                {isAuthenticated && (
                  <div className="rounded-2xl border border-[rgba(42,59,78,0.12)] bg-white/70 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-800">{currentUser?.name ?? "Signed in"}</p>
                    <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{statusLabel}</p>
                  </div>
                )}

                {isAuthenticated ? (
                  <button
                    onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                    className="secondary-button w-full"
                  >
                    Sign Out
                  </button>
                ) : (
                  <button
                    onClick={() => void loginWithRedirect({ appState: { returnTo: "/characters" } })}
                    className="primary-button w-full"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
};

export default Navbar;
