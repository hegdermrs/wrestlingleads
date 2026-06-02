import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import AppShell from "./components/layout/AppShell.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Settings from "./pages/Settings.jsx";
import Rules from "./pages/Rules.jsx";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/team" element={<Rules />} />
          <Route path="/setup" element={<Settings />} />
          <Route path="/settings" element={<Navigate to="/setup" replace />} />
          <Route path="/rules" element={<Navigate to="/team" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
