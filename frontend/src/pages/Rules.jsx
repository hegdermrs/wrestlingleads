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

function defaultRoleLabel(rep) {
  return rep.role_label || BUCKET_INFO[rep.bucket]?.title || "Sales rep";
}

function defaultDescription(rep) {
  return rep.description ?? BUCKET_INFO[rep.bucket]?.hint ?? "";
}

function parseWeeklyCap(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
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
          role_label: (rep.role_label || "").trim() || defaultRoleLabel({ ...rep, role_label: "" }),
          description: (rep.description || "").trim() || defaultDescription({ ...rep, description: "" }),
          weekly_cap: parseWeeklyCap(rep.weekly_cap),
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
            <strong>Notifications aren't set up yet.</strong> Leads can still be assigned, but reps won't be
            notified until you add <code>N8N_WEBHOOK_URL</code> or email settings on Railway (Setup tab).
          </p>
        </Card>
      )}

      <Card title="Automatic routing" subtitle="What happens when someone fills out your form" delay={60}>
        {(rules?.routing_mode === "hybrid" || rules?.routing_mode === "percentile") && (
          <div className="banner-warn" style={{ marginBottom: "1rem" }}>
            <p>
              {rules?.routing_mode === "hybrid" ? (
                <>
                  <strong>Hybrid mode</strong> — Urgent red-hot leads (Priority + ready soon + score ≥
                  urgent min) go to <strong>Gene</strong> first. Everyone else is split by rank: top{" "}
                  {rules?.distribution_gene_pct ?? 10}% Gene, next {rules?.distribution_jake_pct ?? 20}%
                  Jake, middle {rules?.distribution_general_pct ?? 50}% Beau/Eric, bottom{" "}
                  {rules?.distribution_automation_pct ?? 20}% automation.
                </>
              ) : (
                <>
                  <strong>Percentile mode</strong> — Gene gets the top{" "}
                  {rules?.distribution_gene_pct ?? 10}% of scored leads in your inbox, Jake the next{" "}
                  {rules?.distribution_jake_pct ?? 20}%, Beau &amp; Eric the middle{" "}
                  {rules?.distribution_general_pct ?? 50}%, bottom{" "}
                  {rules?.distribution_automation_pct ?? 20}% to automation (no rep email).
                </>
              )}{" "}
              Needs at least {rules?.min_leads_for_percentile ?? 15} scored leads before percentiles
              apply.
            </p>
          </div>
        )}
        <Toggle
          checked={!!rules?.auto_route_enabled}
          onChange={(v) => setRules({ ...rules, auto_route_enabled: v })}
          label="Route new leads automatically"
          description="Runs right after each form submission (~30 seconds)"
        />
        <Toggle
          checked={!!rules?.send_email_on_route}
          onChange={(v) => setRules({ ...rules, send_email_on_route: v })}
          label="Notify the assigned rep"
          description="Triggers n8n webhook and/or email (Resend/SMTP) when configured"
        />
        <Toggle
          checked={rules?.sync_hubspot_on_route !== false}
          onChange={(v) => setRules({ ...rules, sync_hubspot_on_route: v })}
          label="Sync HubSpot on route"
          description="Create or update the HubSpot contact when HUBSPOT_ACCESS_TOKEN is set on Railway"
        />
      </Card>

      <Card title="Your sales team" subtitle="Edit role, name, description, email, and weekly limit — save when done" delay={100}>
        <div className="team-grid">
          {(rules?.reps || []).map((rep, index) => {
            const cap = parseWeeklyCap(rep.weekly_cap);
            const count = weekly[rep.id] ?? 0;
            const capPct = cap ? Math.min(100, (count / cap) * 100) : 0;
            const isGeneral = rep.bucket === "general";

            return (
              <div key={rep.id || index} className={`team-card ${repBucketClass(rep.bucket)} animate-slide-up`} style={{ animationDelay: `${index * 70}ms` }}>
                <div className="team-card-body">
                  <div className="team-card-head">
                    <div className="team-avatar" aria-hidden="true">
                      {rep.name?.charAt(0) || "?"}
                    </div>
                    <div className="team-card-fields">
                      <label className="field-label">
                        Role label
                        <input
                          className="input team-role-input"
                          value={rep.role_label ?? ""}
                          onChange={(e) => updateRep(index, "role_label", e.target.value)}
                          placeholder={BUCKET_INFO[rep.bucket]?.title || "Sales rep"}
                        />
                      </label>
                      <label className="field-label">
                        Name
                        <input
                          className="input team-name-input"
                          value={rep.name || ""}
                          onChange={(e) => updateRep(index, "name", e.target.value)}
                          placeholder="Full name"
                        />
                      </label>
                    </div>
                  </div>

                  <label className="field-label">
                    What leads they get
                    <textarea
                      className="input team-desc-input"
                      rows={2}
                      value={rep.description ?? ""}
                      onChange={(e) => updateRep(index, "description", e.target.value)}
                      placeholder={BUCKET_INFO[rep.bucket]?.hint || "What kinds of leads go here"}
                    />
                  </label>

                  <label className="field-label">
                    Email
                    <input
                      className="input"
                      type="email"
                      value={rep.email || ""}
                      onChange={(e) => updateRep(index, "email", e.target.value)}
                      placeholder="rep@email.com"
                    />
                  </label>

                  <label className="field-label">
                    Weekly limit
                    <input
                      className="input cap-input"
                      type="number"
                      min="0"
                      step="1"
                      value={rep.weekly_cap ?? ""}
                      onChange={(e) =>
                        updateRep(index, "weekly_cap", e.target.value === "" ? null : e.target.value)
                      }
                      placeholder="No limit"
                    />
                  </label>
                </div>

                <div className="team-card-footer">
                  <div className="cap-meter">
                    <div className="cap-label">
                      This week: <strong>{count}</strong>
                      {cap != null ? ` of ${cap}` : " assigned · no limit"}
                    </div>
                    <div className="cap-track">
                      <div className="cap-fill" style={{ width: `${capPct}%` }} />
                    </div>
                  </div>

                  <div className={`team-card-toggle ${isGeneral ? "" : "is-spacer"}`}>
                    {isGeneral && (
                      <Toggle
                        checked={!!rep.west_coast_priority}
                        onChange={(v) => updateRep(index, "west_coast_priority", v)}
                        label="West Coast priority"
                        description="Gets West Coast states first"
                        compact
                      />
                    )}
                  </div>
                </div>
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
                {row.email_sent && <span className="sent-tag">Notified</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
