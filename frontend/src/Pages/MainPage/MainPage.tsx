import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "convex/react";
import { convexCurrentUser } from "@/lib/convexFunctions";
import { INTERVIEWERS } from "../CharactersPage/CharactersPage";

const pillars = [
  {
    title: "Voice-first sessions",
    copy: "Hear the prompt, respond out loud, and practice the pacing interviewers actually react to.",
  },
  {
    title: "Role-shaped prompts",
    copy: "Paste a job description and optionally a resume to generate a sharper, more relevant session.",
  },
  {
    title: "Useful critique",
    copy: "Scorecards, question-level feedback, and follow-up signals make the next attempt more deliberate.",
  },
];

const steps = [
  { label: "Pick an interviewer", detail: "Choose Jon or Hope and keep the tone steady, warm, or custom-cloned." },
  { label: "Load the role brief", detail: "Drop in the job description and resume so the interview is anchored to the real target." },
  { label: "Run a full session", detail: "Answer verbally with a timer, webcam capture, and live transcript support." },
  { label: "Review the tape", detail: "Use per-question feedback and archived sessions to iterate with intent." },
];

const HomePage = () => {
  const { isAuthenticated } = useAuth0();
  const currentUser = useQuery(convexCurrentUser, {});
  const primaryHref = isAuthenticated ? "/characters" : "/signin";
  const secondaryHref = isAuthenticated ? "/pastinterviews" : "/signin";
  const primaryLabel = isAuthenticated ? "Start Session" : "Claim Free Session";
  const secondaryLabel = isAuthenticated ? "Open Archive" : "View Account";
  const freeStatus = currentUser && !currentUser.freeInterviewUsed
    ? "Your first session is ready."
    : isAuthenticated
      ? "Your free session has been used."
      : "One free session after sign-in.";

  return (
    <div className="page-stack pointer-events-auto">
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="surface-panel-strong overflow-hidden"
      >
        <div className="grid gap-10 px-6 py-8 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-10 lg:py-10">
          <div className="space-y-6">
            <span className="eyebrow">Interview rehearsal studio</span>

            <div className="space-y-4">
              <h1 className="hero-display max-w-3xl text-slate-950">
                Practice the conversation,
                <span className="block text-[rgb(182,86,41)]">not just the answer.</span>
              </h1>
              <p className="body-muted max-w-2xl">
                MockCortex turns interview prep into a repeatable studio workflow: deliberate prompts, a real voice in your ear,
                and feedback built to sharpen the next run instead of flattering the last one.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link to={primaryHref} className="primary-button">
                {primaryLabel}
              </Link>
              <Link to={secondaryHref} className="secondary-button">
                {secondaryLabel}
              </Link>
              <span className="rounded-full border border-[rgba(42,59,78,0.12)] bg-white/70 px-4 py-3 text-sm font-medium text-slate-600">
                {freeStatus}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {pillars.map((pillar) => (
                <div key={pillar.title} className="rounded-[24px] border border-[rgba(107,83,57,0.12)] bg-white/70 p-4">
                  <p className="text-sm font-bold uppercase tracking-[0.16em] text-[rgb(154,77,37)]">{pillar.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{pillar.copy}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="ink-panel editorial-grid relative overflow-hidden p-6">
            <div className="absolute -right-16 top-0 h-44 w-44 rounded-full bg-[rgba(214,128,77,0.18)] blur-3xl" />
            <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-[rgba(121,171,204,0.16)] blur-3xl" />
            <div className="relative space-y-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[rgba(235,205,181,0.72)]">Session Blueprint</p>
                <h2 className="mt-3 text-3xl font-semibold leading-tight text-white">
                  A sharper interface for serious prep.
                </h2>
              </div>

              <div className="grid gap-3">
                {steps.map((step, index) => (
                  <div key={step.label} className="rounded-[24px] border border-white/8 bg-white/5 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[rgba(235,205,181,0.72)]">
                      Step {index + 1}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">{step.label}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">{step.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
        className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]"
      >
        <div className="surface-panel p-6 sm:p-8">
          <span className="eyebrow">Interviewers</span>
          <h2 className="section-title mt-4 text-slate-950">Choose a voice that sets the room.</h2>
          <p className="body-muted mt-3 max-w-xl">
            The strongest prep products do not hide behind generic avatars. They make the setting feel specific. MockCortex keeps the roster small on purpose so each interviewer feels intentional.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {INTERVIEWERS.map((char) => (
              <Link key={char.id} to={primaryHref} className="rounded-[24px] border border-[rgba(107,83,57,0.12)] bg-white/75 p-4 transition-all hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(87,58,32,0.1)]">
                <div className="flex items-start gap-4">
                  <img src={char.img} alt={char.name} className="h-20 w-20 rounded-[20px] object-cover" />
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[rgb(154,77,37)]">{char.tag}</p>
                    <p className="text-xl font-semibold text-slate-900">{char.name}</p>
                    <p className="text-sm leading-6 text-slate-600">{char.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="surface-panel p-6 sm:p-8">
          <span className="eyebrow">What makes it feel crafted</span>
          <h2 className="section-title mt-4 text-slate-950">The product now reads more like a studio than a prompt demo.</h2>
          <div className="mt-6 grid gap-4">
            <div className="rounded-[24px] border border-[rgba(107,83,57,0.12)] bg-[rgba(251,244,234,0.9)] p-5">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[rgb(154,77,37)]">Clear hierarchy</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Display serif for narrative emphasis, geometric sans for utility, and a tighter set of spacing rules.</p>
            </div>
            <div className="rounded-[24px] border border-[rgba(107,83,57,0.12)] bg-white/80 p-5">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[rgb(154,77,37)]">Deliberate palette</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Warm paper surfaces, dark editorial panels, and one rust accent instead of default purple glass everywhere.</p>
            </div>
            <div className="rounded-[24px] border border-[rgba(107,83,57,0.12)] bg-white/80 p-5">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[rgb(154,77,37)]">Specific product language</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Session archive, rehearsal studio, and blueprint framing make the interface sound like your product, not a generic AI tool.</p>
            </div>
          </div>
        </div>
      </motion.section>
    </div>
  );
};

export default HomePage;
