import { useCallback, useEffect, useState } from "react";
import {
  fetchJson,
  fetchRoutingRules,
  fetchRoutingStats,
  fetchScoringRubric,
  saveRoutingRules,
  saveScoringRubric,
  sendRoute,
  sendUnrouted,
} from "../api.js";
import Card from "../components/ui/Card.jsx";
import Toggle from "../components/ui/Toggle.jsx";
import Toast from "../components/ui/Toast.jsx";
import LoadingSkeleton from "../components/ui/LoadingSkeleton.jsx";
import Badge from "../components/ui/Badge.jsx";
import { BUCKET_INFO } from "../constants/labels.js";
import { REP_SCORING_FIELDS } from "../constants/repScoringFields.js";

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
  const [rubric, setRubric] = useState({ Hot: 68, Warm: 42, Cold: 18 });
  const [coachingBoost, setCoachingBoost] = useState(8);
  const [icpLlmMin, setIcpLlmMin] = useState(68);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r, s, rubricData] = await Promise.all([
        fetchRoutingRules(),
        fetchRoutingStats(),
        fetchScoringRubric().catch(() => null),
      ]);
      setRules(r);
      setStats(s);
      if (rubricData?.tiers) setRubric(rubricData.tiers);
      if (rubricData?.coaching_score_boost != null) setCoachingBoost(rubricData.coaching_score_boost);
      if (rubricData?.icp_llm_min != null) setIcpLlmMin(rubricData.icp_llm_min);
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
      const rubricResult = await saveScoringRubric({
        tiers: {
          Hot: Number(rubric.Hot),
          Warm: Number(rubric.Warm),
          Cold: Number(rubric.Cold),
        },
        coaching_score_boost: Number(coachingBoost),
        icp_llm_min: Number(icpLlmMin),
      });
      setRules(saved);
      if (rubricResult?.tiers) setRubric(rubricResult.tiers);
      const relabeled = rubricResult?.leads_relabeled ?? 0;
      setMessage(
        relabeled > 0
          ? `Saved — ${relabeled.toLocaleString()} leads updated with new priority labels.`
          : "Saved."
      );
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
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">
            Set who gets new leads, how they&apos;re prioritized, and when reps get notified.
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
            <strong>Rep notifications aren&apos;t on yet.</strong> Leads can still be assigned in the inbox.
            Turn on <strong>Email the assigned rep</strong> below once your admin finishes email setup on the Setup tab.
          </p>
        </Card>
      )}

      <Card title="When a lead comes in" subtitle="Usually within about 30 seconds of the form" delay={60}>
        <p className="field-hint" style={{ marginBottom: "1rem" }}>
          Each person&apos;s card below controls their share of leads and priority labels. Top-priority leads
          ready to start can go to Gene before the normal split.
        </p>
        <Toggle
          checked={!!rules?.auto_route_enabled}
          onChange={(v) => setRules({ ...rules, auto_route_enabled: v })}
          label="Assign new leads automatically"
          description="Picks the right rep as soon as the lead is scored"
        />
        <Toggle
          checked={!!rules?.send_email_on_route}
          onChange={(v) => setRules({ ...rules, send_email_on_route: v })}
          label="Email the assigned rep"
          description="Sends a notification when email or automation is set up in Setup"
        />
        <Toggle
          checked={rules?.sync_hubspot_on_route !== false}
          onChange={(v) => setRules({ ...rules, sync_hubspot_on_route: v })}
          label="Update HubSpot when assigned"
          description="Keeps the contact record in sync if HubSpot is connected"
        />
      </Card>

      <Card
        title="Your team"
        subtitle="Open each card to edit name, email, limits, and how leads are split — then Save changes"
        delay={100}
      >
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
                        Role (shown on emails)
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

                  {(REP_SCORING_FIELDS[rep.bucket] || []).length > 0 && (
                    <div className="team-scoring-block">
                      <p className="team-scoring-title">Lead split & priorities</p>
                      {(REP_SCORING_FIELDS[rep.bucket] || []).map((field) => {
                        const editHere = !field.editOnRepId || field.editOnRepId === rep.id;
                        if (!editHere) {
                          return (
                            <p key={field.rulesKey || field.rubricKey} className="field-hint team-scoring-readonly">
                              {field.label} — edit on Beau&apos;s card
                            </p>
                          );
                        }

                        let value = "";
                        let onChange = () => {};

                        if (field.rulesKey) {
                          value = rules?.[field.rulesKey] ?? "";
                          onChange = (e) =>
                            setRules((prev) => ({ ...prev, [field.rulesKey]: e.target.value }));
                        } else if (field.rubricKey) {
                          value = rubric[field.rubricKey] ?? "";
                          onChange = (e) =>
                            setRubric((prev) => ({ ...prev, [field.rubricKey]: e.target.value }));
                        } else if (field.scoringKey === "coaching_score_boost") {
                          value = coachingBoost;
                          onChange = (e) => setCoachingBoost(e.target.value);
                        } else if (field.scoringKey === "icp_llm_min") {
                          value = icpLlmMin;
                          onChange = (e) => setIcpLlmMin(e.target.value);
                        }

                        return (
                          <label key={field.rulesKey || field.rubricKey || field.scoringKey} className="rubric-row">
                            <span className="rubric-label">
                              <strong>{field.label}</strong>
                            </span>
                            <div className="rubric-input-wrap">
                              {field.prefix && <span className="rubric-prefix">{field.prefix}</span>}
                              <input
                                className="input rubric-input"
                                type="number"
                                min={field.min ?? 0}
                                max={field.max ?? 100}
                                step={field.step ?? 1}
                                value={value}
                                onChange={onChange}
                              />
                              {field.suffix && <span className="rubric-prefix">{field.suffix}</span>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {rep.bucket !== "automation" && (
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
                  )}

                  {rep.bucket !== "automation" && (
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
                  )}
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

      <Card title="West Coast states" subtitle="These states go to Eric first, then Beau" delay={140}>
        <input
          className="input wide"
          value={(rules?.west_coast_states || []).join(", ")}
          onChange={(e) =>
            setRules({ ...rules, west_coast_states: e.target.value.split(",").map((s) => s.trim()) })
          }
          placeholder="CA, OR, WA, NV, AZ, HI, AK"
        />
        <p className="field-hint">Uses the state from your form. Other states follow the normal Beau &amp; Eric split.</p>
      </Card>

      <Card title="Try it" subtitle="Pick a lead from your inbox by email" delay={180}>
        <div className="inline-form">
          <input
            className="input"
            type="email"
            placeholder="Lead email address"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
          <button type="button" className="btn secondary" onClick={() => handleTestRoute(false)} disabled={saving}>
            See who would get it
          </button>
          <button type="button" className="btn" onClick={() => handleTestRoute(true)} disabled={saving}>
            Assign &amp; notify now
          </button>
        </div>
        <button type="button" className="btn ghost" onClick={handleSendUnrouted} disabled={saving}>
          Assign everyone still waiting
        </button>
      </Card>

      {stats?.recent?.length > 0 && (
        <Card title="Recent assignments" subtitle="Newest first" delay={220}>
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
