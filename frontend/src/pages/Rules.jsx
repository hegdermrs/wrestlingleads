import { useCallback, useEffect, useState } from "react";
import {
  fetchJson,
  fetchRoutingRules,
  fetchRoutingStats,
  saveRoutingRules,
  sendRoute,
  sendUnrouted,
} from "../api.js";
import Card from "../components/ui/Card.jsx";
import Toggle from "../components/ui/Toggle.jsx";
import Toast from "../components/ui/Toast.jsx";
import LoadingSkeleton from "../components/ui/LoadingSkeleton.jsx";
import Badge from "../components/ui/Badge.jsx";
import { BUCKET_INFO } from "../constants/labels.js";

function repBucketClass(bucket) {
  return BUCKET_INFO[bucket]?.color || "rep-general";
}

export default function Rules() {
  const [rules, setRules] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testEmail, setTestEmail] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r, s] = await Promise.all([fetchRoutingRules(), fetchRoutingStats()]);
      setRules(r);
      setStats(s);
    } catch (err) {
      setError(err.message || "Could not load team settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateRep = (index, field, value) => {
    setRules((prev) => {
      const reps = [...(prev.reps || [])];
      reps[index] = { ...reps[index], [field]: value };
      return { ...prev, reps };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        ...rules,
        west_coast_states: (rules.west_coast_states || [])
          .flatMap((s) => String(s).split(/[,\s]+/))
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
        reps: (rules.reps || []).map((rep) => ({
          ...rep,
          weekly_cap:
            rep.weekly_cap === "" || rep.weekly_cap == null ? null : Number(rep.weekly_cap),
        })),
      };
      const saved = await saveRoutingRules(payload);
      setRules(saved);
      setMessage("Team routing saved.");
      await refresh();
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleTestRoute = async (sendEmail = false) => {
    if (!testEmail.trim()) {
      setError("Enter a lead's email from the inbox.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = sendEmail
        ? await sendRoute(testEmail.trim(), { send_email: true })
        : await fetchJson("/routing/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: testEmail.trim() }),
          });
      if (result.assigned) {
        setMessage(
          `Would go to ${result.rep?.name}` +
            (result.email_sent ? " — email sent!" : sendEmail && result.notify_error ? ` (email failed)` : "")
        );
      } else {
        setMessage(result.skipped_reason || "This lead wouldn't be routed.");
      }
      await refresh();
    } catch (err) {
      setError(err.message || "Test failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSendUnrouted = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await sendUnrouted();
      const sent = (result.results || []).filter((r) => r.assigned).length;
      setMessage(`Sent ${sent} lead${sent === 1 ? "" : "s"} to your team.`);
      await refresh();
    } catch (err) {
      setError(err.message || "Batch send failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !rules) {
    return <LoadingSkeleton rows={5} />;
  }

  const weekly = stats?.weekly?.by_rep || {};

  return (
    <>
      <div className="page-intro animate-fade-in">
        <div>
          <h1 className="page-title">Team routing</h1>
          <p className="page-subtitle">
            When a new lead comes in, we score it and email the right rep automatically.
          </p>
        </div>
        <button type="button" className="btn" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <Toast type="success" message={message} />
      <Toast type="error" message={error} />

      {!rules?.smtp_configured && (
        <Card className="banner-warn" delay={40}>
          <p>
            <strong>Emails aren't set up yet.</strong> Leads can still be assigned on the dashboard, but reps
            won't get email notifications until your admin adds mail settings on the server.
          </p>
        </Card>
      )}

      <Card title="Automatic routing" subtitle="What happens when someone fills out your form" delay={60}>
        <Toggle
          checked={!!rules?.auto_route_enabled}
          onChange={(v) => setRules({ ...rules, auto_route_enabled: v })}
          label="Route new leads automatically"
          description="Runs right after each form submission (~30 seconds)"
        />
        <Toggle
          checked={!!rules?.send_email_on_route}
          onChange={(v) => setRules({ ...rules, send_email_on_route: v })}
          label="Email the assigned rep"
          description="Sends lead name, message, and score"
        />
      </Card>

      <Card title="Your sales team" subtitle="Tap a card to edit — weekly counts reset each Monday" delay={100}>
        <div className="team-grid">
          {(rules?.reps || []).map((rep, index) => {
            const info = BUCKET_INFO[rep.bucket] || BUCKET_INFO.general;
            const cap = rep.weekly_cap;
            const count = weekly[rep.id] ?? 0;
            const capPct = cap ? Math.min(100, (count / cap) * 100) : null;

            return (
              <div key={rep.id || index} className={`team-card ${repBucketClass(rep.bucket)} animate-slide-up`} style={{ animationDelay: `${index * 70}ms` }}>
                <div className="team-card-head">
                  <div className="team-avatar">{rep.name?.charAt(0) || "?"}</div>
                  <div>
                    <p className="team-role">{info.title}</p>
                    <input
                      className="input team-name-input"
                      value={rep.name || ""}
                      onChange={(e) => updateRep(index, "name", e.target.value)}
                      placeholder="Name"
                    />
                  </div>
                </div>
                <p className="team-hint">{info.hint}</p>
                <label className="field-label">
                  Email
                  <input
                    className="input"
                    type="email"
                    value={rep.email || ""}
                    onChange={(e) => updateRep(index, "email", e.target.value)}
                  />
                </label>
                {cap != null && (
                  <div className="cap-meter">
                    <div className="cap-label">
                      This week: <strong>{count}</strong> of {cap}
                    </div>
                    <div className="cap-track">
                      <div className="cap-fill" style={{ width: `${capPct}%` }} />
                    </div>
                  </div>
                )}
                {!cap && (
                  <p className="muted cap-open">No weekly limit · {count} assigned this week</p>
                )}
                {rep.west_coast_priority && (
                  <span className="region-tag">🌊 West Coast priority</span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="West Coast states" subtitle="Leads from these states go to Eric first (then Beau)" delay={140}>
        <input
          className="input wide"
          value={(rules?.west_coast_states || []).join(", ")}
          onChange={(e) =>
            setRules({ ...rules, west_coast_states: e.target.value.split(",").map((s) => s.trim()) })
          }
          placeholder="CA, OR, WA, NV, AZ, HI, AK"
        />
        <p className="field-hint">Uses the state field from your form. Leave blank states to Beau & Eric by balance.</p>
      </Card>

      <Card title="Try it" subtitle="Test with a real lead from your inbox" delay={180}>
        <div className="inline-form">
          <input
            className="input"
            type="email"
            placeholder="Lead email address"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
          <button type="button" className="btn secondary" onClick={() => handleTestRoute(false)} disabled={saving}>
            Preview
          </button>
          <button type="button" className="btn" onClick={() => handleTestRoute(true)} disabled={saving}>
            Send now
          </button>
        </div>
        <button type="button" className="btn ghost" onClick={handleSendUnrouted} disabled={saving}>
          Send all unrouted leads to the team
        </button>
      </Card>

      {stats?.recent?.length > 0 && (
        <Card title="Recent assignments" delay={220}>
          <ul className="assignment-list">
            {stats.recent.map((row, i) => (
              <li key={`${row.at}-${i}`} className="assignment-row animate-fade-in" style={{ animationDelay: `${i * 40}ms` }}>
                <span className="assignment-who">{row.rep_name}</span>
                <span className="assignment-lead">{row.lead_email}</span>
                <Badge tier={row.ai_tier} showEmoji={false} />
                {row.email_sent && <span className="sent-tag">Emailed</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
