import { Link, useLocation } from "react-router";
import { motion } from "motion/react";
import logo from "../assets/logo.png";

const links = [
  { to: "/", label: "Home" },
  { to: "/characters", label: "Interviewers" },
  { to: "/pastinterviews", label: "History" },
];

const Navbar = () => {
  const { pathname } = useLocation();

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="fixed top-4 left-4 right-4 z-50"
    >
      <div className="mx-auto max-w-5xl flex items-center justify-between px-5 py-3 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 shadow-lg shadow-black/40">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 cursor-pointer">
          <img src={logo} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
          <span className="font-bold text-white text-base tracking-tight">MockCortex</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {links.map(({ to, label }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* CTA */}
        <Link
          to="/characters"
          className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors cursor-pointer"
        >
          Start Interview
        </Link>
      </div>
    </motion.header>
  );
};

export default Navbar;
