import './App.css'
import { Outlet } from 'react-router'
import Navbar from './Components/Navbar'
import Footer from './Components/Footer'
import AuthSync from './Components/AuthSync';

function App() {
  return (
    <div className="app-shell">
      <AuthSync />
      <Navbar />
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 editorial-grid opacity-40" />
        <div className="absolute left-[8%] top-20 h-64 w-64 rounded-full bg-[rgba(201,98,49,0.12)] blur-3xl" />
        <div className="absolute right-[6%] top-40 h-80 w-80 rounded-full bg-[rgba(11,73,117,0.12)] blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-[rgba(87,58,32,0.08)] blur-3xl" />
      </div>
      <main className="app-frame flex-1">
        <Outlet />
      </main>
      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}

export default App
