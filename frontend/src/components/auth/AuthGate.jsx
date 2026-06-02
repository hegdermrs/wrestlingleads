import { useState } from "react";

const AUTH_KEY = "lw_auth";
const DEFAULT_PASSWORD = "admin123";

function appPassword() {
  const fromEnv = import.meta.env.VITE_APP_PASSWORD?.trim();
  return fromEnv || DEFAULT_PASSWORD;
}

export function isAuthenticated() {
  return sessionStorage.getItem(AUTH_KEY) === "1";
}

export function signOut() {
  sessionStorage.removeItem(AUTH_KEY);
}

export default function AuthGate({ children }) {
  const [authed, setAuthed] = useState(isAuthenticated);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    if (password === appPassword()) {
      sessionStorage.setItem(AUTH_KEY, "1");
      setAuthed(true);
      setError("");
      setPassword("");
      return;
    }
    setError("Incorrect password. Try again.");
  };

  if (authed) {
    return children;
  }

  return (
    <div className="auth-screen">
      <form className="auth-card animate-fade-in" onSubmit={handleSubmit}>
        <div className="brand-mark auth-brand">LW</div>
        <h1 className="auth-title">LeadsWrestling</h1>
        <p className="auth-sub">Enter the app password to continue.</p>
        <label className="field-label" htmlFor="app-password">
          Password
        </label>
        <input
          id="app-password"
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
        />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="btn auth-submit">
          Sign in
        </button>
      </form>
    </div>
  );
}
