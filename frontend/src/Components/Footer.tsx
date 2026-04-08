import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="pointer-events-auto px-4 pb-8 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 rounded-[28px] border border-[rgba(107,83,57,0.16)] bg-[rgba(255,251,244,0.82)] px-6 py-6 shadow-[0_18px_60px_rgba(87,58,32,0.06)] backdrop-blur-xl sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[rgb(154,77,37)]">MockCortex</p>
          <p className="max-w-sm text-sm leading-6 text-slate-600">
            Practice interview delivery, not just answers. Voice-led sessions, tailored prompts, and structured feedback in one flow.
          </p>
        </div>

        <nav className="flex flex-wrap gap-4 text-sm font-medium text-slate-600">
          <Link to="/" className="hover:text-slate-950">Overview</Link>
          <Link to="/characters" className="hover:text-slate-950">Interviewers</Link>
          <Link to="/pastinterviews" className="hover:text-slate-950">Session Archive</Link>
        </nav>

        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Built for Macathon 2026</p>
      </div>
    </footer>
  );
};

export default Footer;
