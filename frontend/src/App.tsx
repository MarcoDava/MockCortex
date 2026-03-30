import './App.css'
import { Outlet } from 'react-router'
import Navbar from './Components/Navbar'
import Footer from './Components/Footer'
import { HexagonBackground } from "./Components/ui/hexagon";

function App() {
  return (
    <div className="m-0 p-0 w-[100vw] h-full min-h-[100vh] flex flex-col text-white">
      <Navbar />
      <HexagonBackground glowColor="rgba(139, 92, 246, 0.5)" />
      <div className="w-full z-10 flex-1 pt-24">
        <Outlet />
      </div>
      <div className="w-full z-10">
        <Footer />
      </div>
    </div>
  );
}

export default App
