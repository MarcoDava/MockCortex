import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { INTERVIEWERS } from "../CharactersPage/CharactersPage";

const steps = [
  { num: "01", label: "Choose your voice", desc: "Pick Jon or Hope as your interviewer. Upload an MP3 or YouTube link to clone any voice." },
  { num: "02", label: "Paste the job description", desc: "Add the role description and optionally upload your resume for tailored questions." },
  { num: "03", label: "Answer out loud", desc: "2 minutes per question. Your webcam, transcript, and facial expressions are captured live." },
  { num: "04", label: "Get scored feedback", desc: "Gemini grades each answer 0–10 with critique. Optional neural brain map via TRIBE v2." },
];

const HomePage = () => {
  return (
    <div className="min-h-screen flex flex-col items-center px-4 pb-20 pointer-events-auto">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mt-12 text-center max-w-3xl mx-auto space-y-6"
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-600/20 border border-violet-500/30 text-violet-300 text-sm font-medium">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          Built for Macathon 2026
        </div>

        <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[1.05] text-white">
          Practice interviews<br />
          <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-rose-400 bg-clip-text text-transparent">
            that actually help
          </span>
        </h1>

        <p className="text-gray-400 text-lg max-w-xl mx-auto leading-relaxed">
          Build confidence with structured mock interviews, answer recordings, facial-expression trends,
          and personalized improvement feedback.
        </p>

        <div className="flex items-center justify-center gap-4 pt-2">
          <Link
            to="/characters"
            className="px-8 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-base transition-all hover:shadow-[0_0_30px_rgba(139,92,246,0.4)] cursor-pointer"
          >
            Start Interview
          </Link>
          <Link
            to="/pastinterviews"
            className="px-8 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-base transition-colors cursor-pointer"
          >
            Past Sessions
          </Link>
        </div>
      </motion.section>

      {/* Character preview */}
      <motion.section
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
        className="mt-20 w-full max-w-2xl"
      >
        <p className="text-center text-gray-500 text-sm font-medium uppercase tracking-widest mb-6">
          Choose your interviewer
        </p>
        <div className="grid grid-cols-2 gap-4">
          {INTERVIEWERS.map((char) => (
            <Link
              key={char.id}
              to="/characters"
              className="group flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/8 hover:border-violet-500/50 hover:bg-violet-600/10 transition-all cursor-pointer"
            >
              <div className="w-16 h-16 rounded-2xl overflow-hidden ring-2 ring-white/10 group-hover:ring-violet-500/50 transition-all">
                <img src={char.img} alt={char.name} className="w-full h-full object-cover" />
              </div>
              <p className="text-white text-sm font-semibold text-center leading-tight">{char.name}</p>
              <p className="text-gray-500 text-xs text-center leading-tight">{char.description}</p>
            </Link>
          ))}
        </div>
      </motion.section>

      {/* How it works */}
      <motion.section
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.35, ease: "easeOut" }}
        className="mt-16 w-full max-w-2xl"
      >
        <p className="text-center text-gray-500 text-sm font-medium uppercase tracking-widest mb-8">
          How it works
        </p>
        <div className="space-y-3">
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex items-start gap-5 p-5 rounded-2xl bg-white/4 border border-white/8 hover:border-white/12 transition-colors"
            >
              <span className="text-xs font-bold tabular-nums text-violet-400/70 mt-0.5 w-6 shrink-0">{step.num}</span>
              <div>
                <p className="text-white text-sm font-semibold leading-snug">{step.label}</p>
                <p className="text-gray-500 text-xs leading-relaxed mt-1">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.section>
    </div>
  );
};

export default HomePage;
