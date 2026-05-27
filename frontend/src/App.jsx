import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import Settings from "./pages/Settings.jsx";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <div className="page">
        <header className="topbar">
          <div>
            <p className="eyebrow">LeadsWrestling</p>
            <h1>Lead Qualifier</h1>
          </div>
          <nav className="nav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              Dashboard
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              Settings
            </NavLink>
          </nav>
        </header>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
