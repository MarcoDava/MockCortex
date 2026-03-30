import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { CHARACTERS } from "../CharactersPage/CharactersPage";

const steps = [
  { icon: "🎭", label: "Pick a character", desc: "Choose from our iconic meme interviewers" },
  { icon: "📄", label: "Paste the JD", desc: "Drop in the job description (and your resume)" },
  { icon: "🎙️", label: "Do the interview", desc: "5 questions, voice-recorded, webcam on" },
  { icon: "📊", label: "Get feedback", desc: "AI scores every answer with brutal honesty" },
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
          AI Mock Interviews — No cringe, just rizz
        </div>

        <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-none text-white">
          Practice interviews
          <br />
          <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-rose-400 bg-clip-text text-transparent">
            with your faves
          </span>
        </h1>

        <p className="text-gray-400 text-lg max-w-xl mx-auto leading-relaxed">
          Get roasted by Skibidi Toilet, Trump, or Tung Tung Sahur. Real AI feedback.
          Actual interview skills. Zero anxiety.
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
        <div className="grid grid-cols-3 gap-4">
          {CHARACTERS.map((char) => (
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
        className="mt-20 w-full max-w-3xl"
      >
        <p className="text-center text-gray-500 text-sm font-medium uppercase tracking-widest mb-8">
          How it works
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex flex-col items-center text-center gap-3 p-5 rounded-2xl bg-white/5 border border-white/8"
            >
              <span className="text-3xl">{step.icon}</span>
              <p className="text-white text-sm font-semibold">{step.label}</p>
              <p className="text-gray-500 text-xs leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </motion.section>
    </div>
  );
};

export default HomePage;
