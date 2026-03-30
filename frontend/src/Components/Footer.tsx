import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="w-full border-t border-white/8 py-8 bg-black/40 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-sm font-bold bg-gradient-to-r from-violet-400 to-rose-400 bg-clip-text text-transparent">
            MockRot
          </h2>
          <p className="text-gray-600 text-xs mt-0.5">Built for Macathon 2026</p>
        </div>

        <nav className="flex gap-6 text-sm text-gray-500">
          <Link to="/" className="hover:text-white transition-colors cursor-pointer">Home</Link>
          <Link to="/characters" className="hover:text-white transition-colors cursor-pointer">Characters</Link>
          <Link to="/pastinterviews" className="hover:text-white transition-colors cursor-pointer">History</Link>
        </nav>

        <p className="text-gray-600 text-xs">© 2026 MockRot</p>
      </div>
    </footer>
  );
};

export default Footer;
