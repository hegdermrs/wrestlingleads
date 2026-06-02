import { NavLink, Outlet } from "react-router-dom";
import { signOut } from "../auth/AuthGate.jsx";

const NAV = [
  { to: "/", end: true, label: "Leads", desc: "Inbox & priorities" },
  { to: "/team", label: "Team", desc: "Who gets what" },
  { to: "/setup", label: "Setup", desc: "Form connection" },
];

export default function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar animate-fade-in">
        <div className="brand">
          <div className="brand-mark">LW</div>
          <div>
            <p className="brand-title">LeadsWrestling</p>
            <p className="brand-sub">Lead prioritization</p>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <span className="nav-item-label">{item.label}</span>
              <span className="nav-item-desc">{item.desc}</span>
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          className="btn ghost sidebar-signout"
          onClick={() => {
            signOut();
            window.location.reload();
          }}
        >
          Sign out
        </button>
      </aside>

      <div className="main-column">
        <header className="mobile-header">
          <p className="brand-title">LeadsWrestling</p>
          <nav className="mobile-nav">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? "mobile-pill active" : "mobile-pill")}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
