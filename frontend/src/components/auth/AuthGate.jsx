import { useState } from "react";
import { changeAppPassword, loginWithPassword } from "../../api.js";

const AUTH_KEY = "lw_auth";

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
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await loginWithPassword(password);
      sessionStorage.setItem(AUTH_KEY, "1");
      setAuthed(true);
      setPassword("");
    } catch (err) {
      setError(err.message || "Incorrect password.");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await changeAppPassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setMessage(result.message || "Password updated. Sign in with your new password.");
      setShowChangePassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPassword("");
    } catch (err) {
      setError(err.message || "Could not change password.");
    } finally {
      setLoading(false);
    }
  };

  if (authed) {
    return children;
  }

  return (
    <div className="auth-screen">
      <div className="auth-card animate-fade-in">
        {!showChangePassword ? (
          <form onSubmit={handleSubmit}>
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
            {message && <p className="auth-success">{message}</p>}
            <button type="submit" className="btn auth-submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              className="btn ghost auth-link-btn"
              onClick={() => {
                setShowChangePassword(true);
                setError("");
                setMessage("");
              }}
            >
              Change password
            </button>
          </form>
        ) : (
          <form onSubmit={handleChangePassword}>
            <div className="brand-mark auth-brand">LW</div>
            <h1 className="auth-title">Change password</h1>
            <p className="auth-sub">Updates the password saved on the server for all devices.</p>
            <label className="field-label" htmlFor="current-password">
              Current password
            </label>
            <input
              id="current-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <label className="field-label" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
            <label className="field-label" htmlFor="confirm-password">
              Re-enter new password
            </label>
            <input
              id="confirm-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
            {error && <p className="auth-error">{error}</p>}
            {message && <p className="auth-success">{message}</p>}
            <button type="submit" className="btn auth-submit" disabled={loading}>
              {loading ? "Saving…" : "Save new password"}
            </button>
            <button
              type="button"
              className="btn ghost auth-link-btn"
              onClick={() => {
                setShowChangePassword(false);
                setError("");
                setMessage("");
              }}
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
