import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ScoreProgress from "../components/ScoreProgress.jsx";
import Card from "../components/ui/Card.jsx";
import Accordion from "../components/ui/Accordion.jsx";
import Toast from "../components/ui/Toast.jsx";
import Toggle from "../components/ui/Toggle.jsx";
import {
  checkHealth,
  downloadCompareExport,
  downloadTierReport,
  fetchCompareSummary,
  fetchJson,
  fetchIcpProfile,
  fetchScoringRubric,
  saveIcpProfile,
  saveScoringRubric,
  testHubspotConnection,
  testN8nWebhook,
  testSmtpConnection,
  uploadBaseline,
  uploadFile,
  uploadScoreFile,
} from "../api.js";
import { TIER_LABELS } from "../constants/labels.js";

const WEBHOOK_URL = "https://wrestlingleads-production.up.railway.app/webhooks/wufoo";

const RUBRIC_ROWS = [
  { key: "Hot", label: TIER_LABELS.Hot.short, hint: TIER_LABELS.Hot.hint },
  { key: "Warm", label: TIER_LABELS.Warm.short, hint: TIER_LABELS.Warm.hint },
  { key: "Cold", label: TIER_LABELS.Cold.short, hint: TIER_LABELS.Cold.hint },
];

export default function Settings() {
  const [qualifiedFile, setQualifiedFile] = useState(null);
  const [scoreFile, setScoreFile] = useState(null);
  const [baselineFile, setBaselineFile] = useState(null);
  const [reportFile, setReportFile] = useState(null);
  const [useLlm, setUseLlm] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [health, setHealth] = useState(null);
  const [scoreProgress, setScoreProgress] = useState(null);
  const [compareSummary, setCompareSummary] = useState(null);
  const [wufooStatus, setWufooStatus] = useState(null);
  const [rubric, setRubric] = useState({ Hot: 68, Warm: 42, Cold: 18 });
  const [coachingBoost, setCoachingBoost] = useState(8);
  const [icpLlmMin, setIcpLlmMin] = useState(68);
  const [icpSummary, setIcpSummary] = useState("");
  const [icpSaving, setIcpSaving] = useState(false);
  const [rubricSaving, setRubricSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [n8nTesting, setN8nTesting] = useState(false);
  const [hubspotTesting, setHubspotTesting] = useState(false);

  useEffect(() => {
    checkHealth().then(setHealth);
    fetchJson("/webhooks/wufoo/status").then(setWufooStatus).catch(() => null);
    fetchCompareSummary().then(setCompareSummary).catch(() => null);
    fetchScoringRubric()
      .then((data) => {
        if (data?.tiers) setRubric(data.tiers);
        if (data?.coaching_score_boost != null) setCoachingBoost(data.coaching_score_boost);
        if (data?.icp_llm_min != null) setIcpLlmMin(data.icp_llm_min);
      })
      .catch(() => null);
    fetchIcpProfile()
      .then((data) => {
        if (data?.summary) setIcpSummary(data.summary);
      })
      .catch(() => null);
  }, []);

  const handleImportQualified = async () => {
    if (!qualifiedFile) return setError("Choose your Excel file first.");
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await uploadFile("/settings/import-qualified", qualifiedFile);
      setMessage(`Loaded ${data.row_count?.toLocaleString()} leads — open Leads to view.`);
      checkHealth().then(setHealth);
      fetchJson("/webhooks/wufoo/status").then(setWufooStatus).catch(() => null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleScore = async () => {
    if (!scoreFile) return setError("Choose your HubSpot export first.");
    setLoading(true);
    setError("");
    setMessage("");
    setScoreProgress(null);
    try {
      const data = await uploadScoreFile(scoreFile, useLlm, setScoreProgress);
      const count = data.row_count ?? data.summary?.total_leads ?? "?";
      setMessage(`Done! ${count} leads scored and ready in your inbox.`);
      checkHealth().then(setHealth);
      fetchJson("/webhooks/wufoo/status").then(setWufooStatus).catch(() => null);
    } catch (err) {
      setError(err.message);
      setScoreProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const copyWebhook = () => {
    navigator.clipboard?.writeText(WEBHOOK_URL);
    setMessage("Link copied!");
  };

  const handleSaveIcp = async () => {
    setIcpSaving(true);
    setError("");
    setMessage("");
    try {
      const current = await fetchIcpProfile().catch(() => ({}));
      await saveIcpProfile({
        summary: icpSummary.trim(),
        positive_signals: current.positive_signals || [],
        negative_signals: current.negative_signals || [],
        reference_leads: current.reference_leads || [],
      });
      setMessage("ICP profile saved — new scores will use this definition.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIcpSaving(false);
    }
  };

  const handleSaveRubric = async () => {
    setRubricSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await saveScoringRubric({
        tiers: {
          Hot: Number(rubric.Hot),
          Warm: Number(rubric.Warm),
          Cold: Number(rubric.Cold),
        },
        coaching_score_boost: Number(coachingBoost),
        icp_llm_min: Number(icpLlmMin),
      });
      if (result?.tiers) setRubric(result.tiers);
      const relabeled = result?.leads_relabeled ?? 0;
      setMessage(
        relabeled > 0
          ? `Scoring rubric saved — ${relabeled.toLocaleString()} leads re-labeled.`
          : "Scoring rubric saved globally."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setRubricSaving(false);
    }
  };

  const handleSmtpTest = async () => {
    setSmtpTesting(true);
    setError("");
    setMessage("");
    try {
      const result = await testSmtpConnection();
      if (result.ok) {
        const via = result.transport === "resend" ? "Resend (HTTPS)" : "Gmail SMTP";
        const sandbox = result.sandbox ? " — sandbox mode (one inbox)" : "";
        const note = result.note ? ` ${result.note}` : "";
        setMessage(`Email connection OK via ${via}${sandbox}.${note}`);
      } else {
        setError(result.error || "Email test failed.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSmtpTesting(false);
    }
  };

  const handleN8nTest = async () => {
    setN8nTesting(true);
    setError("");
    setMessage("");
    try {
      const result = await testN8nWebhook();
      if (result.ok) {
        setMessage(result.note || "n8n webhook test sent — check your n8n execution log.");
      } else {
        setError(result.error || "n8n test failed.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setN8nTesting(false);
    }
  };

  const handleHubspotTest = async () => {
    setHubspotTesting(true);
    setError("");
    setMessage("");
    try {
      const result = await testHubspotConnection();
      if (result.ok) {
        setMessage(result.note || "HubSpot token is valid.");
      } else {
        setError(result.error || "HubSpot test failed.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setHubspotTesting(false);
    }
  };

  const formConnected = wufooStatus?.secret_configured;
  const hasLeads = (wufooStatus?.cache_row_count ?? 0) > 0;

  return (
    <>
      <div className="page-intro animate-fade-in">
        <div>
          <h1 className="page-title">Setup</h1>
          <p className="page-subtitle">
            Your website form sends leads in automatically. File uploads are only if you need a one-time import.
          </p>
        </div>
        <div className={`status-pill ${health?.status === "ok" ? "ok" : "warn"}`}>
          {health?.status === "ok" ? "● System online" : "○ Offline"}
        </div>
      </div>

      <Toast type="success" message={message} />
      <Toast type="error" message={error} />

      <Card
        title="Ideal customer (ICP)"
        subtitle="Teaches the AI what a perfect lead looks like — Bo Baskett is the built-in archetype"
        delay={18}
      >
        <p className="card-copy">
          This text is sent to DeepSeek on every score. Leads similar to your reference example (parent, mental
          struggle, Fargo-level goal, ready now) should score much higher. Edit the summary; reference leads live
          in <code>config/icp_profile.json</code> on the server.
        </p>
        <label className="field-label" htmlFor="icp-summary">
          ICP summary
        </label>
        <textarea
          id="icp-summary"
          className="input"
          rows={5}
          value={icpSummary}
          onChange={(e) => setIcpSummary(e.target.value)}
          placeholder="Describe your ideal wrestling coaching lead…"
        />
        <button
          type="button"
          className="btn secondary"
          style={{ marginTop: "0.75rem" }}
          onClick={handleSaveIcp}
          disabled={icpSaving || !icpSummary.trim()}
        >
          {icpSaving ? "Saving…" : "Save ICP profile"}
        </button>
      </Card>

      <Card
        title="Scoring rubric"
        subtitle="Minimum score for each tier — saved for all new and existing leads"
        delay={20}
      >
        <p className="card-copy">
          Leads are scored 0–100. Lower cutoffs = more Priority / Good fit labels. Coaching boost adds points
          for real form fills (Wufoo / 1-on-1 intent) after ML + text blend.
        </p>
        <div className="rubric-grid">
          {RUBRIC_ROWS.map((row) => (
            <label key={row.key} className="rubric-row">
              <span className="rubric-label">
                <strong>{row.label}</strong>
                <span className="muted">{row.hint}</span>
              </span>
              <div className="rubric-input-wrap">
                <span className="rubric-prefix">≥</span>
                <input
                  className="input rubric-input"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={rubric[row.key] ?? ""}
                  onChange={(e) =>
                    setRubric((prev) => ({ ...prev, [row.key]: e.target.value }))
                  }
                />
              </div>
            </label>
          ))}
          <label className="rubric-row">
            <span className="rubric-label">
              <strong>Coaching boost</strong>
              <span className="muted">Added to leads with real coaching form data (0–20)</span>
            </span>
            <div className="rubric-input-wrap">
              <span className="rubric-prefix">+</span>
              <input
                className="input rubric-input"
                type="number"
                min={0}
                max={20}
                step={1}
                value={coachingBoost}
                onChange={(e) => setCoachingBoost(e.target.value)}
              />
            </div>
          </label>
          <label className="rubric-row">
            <span className="rubric-label">
              <strong>ICP text minimum</strong>
              <span className="muted">Text score needed to floor strong 1-on-1 leads to Priority</span>
            </span>
            <div className="rubric-input-wrap">
              <span className="rubric-prefix">≥</span>
              <input
                className="input rubric-input"
                type="number"
                min={40}
                max={95}
                step={1}
                value={icpLlmMin}
                onChange={(e) => setIcpLlmMin(e.target.value)}
              />
            </div>
          </label>
          <div className="rubric-row rubric-static">
            <span className="rubric-label">
              <strong>{TIER_LABELS.Unqualified.short}</strong>
              <span className="muted">Below Low priority minimum</span>
            </span>
            <span className="muted rubric-auto">&lt; {rubric.Cold ?? 25}</span>
          </div>
        </div>
        <button
          type="button"
          className="btn"
          onClick={handleSaveRubric}
          disabled={rubricSaving}
        >
          {rubricSaving ? "Saving…" : "Save rubric"}
        </button>
      </Card>

      <Card
        title="n8n notifications"
        subtitle="Send lead assignments to your n8n workflow — no DNS required"
        delay={25}
      >
        <div className={`status-tile ${health?.n8n_configured ? "ok" : "warn"}`} style={{ marginBottom: "1rem" }}>
          <span>Webhook on server</span>
          <strong>{health?.n8n_configured ? "Configured" : "Not set yet"}</strong>
        </div>
        <p className="card-copy">
          When a lead is routed, LeadsWrestling POSTs JSON to your n8n webhook. n8n sends the email (Gmail,
          Outlook, etc.). Runs <strong>alongside</strong> Resend when both are configured.
        </p>
        <ol className="email-checklist">
          <li>In n8n: create a workflow with a <strong>Webhook</strong> trigger (POST)</li>
          <li>Add a <strong>Gmail</strong> or <strong>Send Email</strong> node — map fields from the webhook body</li>
          <li>
            Copy the webhook URL → Railway variable <code>N8N_WEBHOOK_URL</code>
          </li>
          <li>Optional: set <code>N8N_WEBHOOK_SECRET</code> if your webhook checks auth</li>
          <li>Redeploy → Test n8n webhook below → enable <strong>Notify the assigned rep</strong> on Team</li>
        </ol>
        <p className="field-hint">
          <strong>Gmail node:</strong> set message type to <strong>HTML</strong> and body to{" "}
          <code>{`{{ $json.body.email.html }}`}</code> (not <code>email.text</code>). Subject:{" "}
          <code>{`{{ $json.body.email.subject }}`}</code> · To:{" "}
          <code>{`{{ $json.body.rep.email }}`}</code>
        </p>
        <button type="button" className="btn secondary" onClick={handleN8nTest} disabled={n8nTesting}>
          {n8nTesting ? "Sending test…" : "Test n8n webhook"}
        </button>
      </Card>

      <Card
        title="HubSpot CRM sync"
        subtitle="Create or update a contact when a lead is assigned to a rep"
        delay={28}
      >
        <div className={`status-tile ${health?.hubspot_configured ? "ok" : "warn"}`} style={{ marginBottom: "1rem" }}>
          <span>HubSpot token on server</span>
          <strong>{health?.hubspot_configured ? "Configured" : "Not set yet"}</strong>
        </div>
        <ol className="email-checklist">
          <li>
            HubSpot → Settings → Integrations → <strong>Private Apps</strong> → create app with scopes{" "}
            <code>crm.objects.contacts.read</code> and <code>crm.objects.contacts.write</code>
          </li>
          <li>
            Create contact properties from <code>config/hubspot_field_map.json</code> (at minimum{" "}
            <code>lw_assigned_rep</code>, <code>lw_route_reason</code>, <code>lw_assigned_at</code>, plus AI fields
            you want synced)
          </li>
          <li>
            Railway variable <code>HUBSPOT_ACCESS_TOKEN</code> → redeploy
          </li>
          <li>
            Optional: add <code>hubspot_owner_id</code> on each rep in Team routing JSON so HubSpot assigns the
            contact owner
          </li>
          <li>
            Keep <strong>Sync HubSpot on route</strong> enabled in Team rules (default on)
          </li>
        </ol>
        <p className="field-hint">
          Upsert order: HubSpot <strong>Record ID</strong> on the lead (if present) → search by email → create new
          contact. Routing still completes if HubSpot fails; check API response <code>hubspot_error</code>.
        </p>
        <button type="button" className="btn secondary" onClick={handleHubspotTest} disabled={hubspotTesting}>
          {hubspotTesting ? "Testing…" : "Test HubSpot connection"}
        </button>
      </Card>

      <Card
        title="Rep email notifications (Resend / Gmail)"
        subtitle="Optional — direct email from Railway; use n8n above if DNS isn't ready"
        delay={30}
      >
        <div className="banner-warn email-railway-banner">
          <p>
            <strong>Railway Hobby blocks Gmail SMTP</strong> (the “Network is unreachable” error). Your Google
            password is fine — the server cannot open port 587. Use <strong>Resend</strong> on Hobby, or{" "}
            <strong>upgrade Railway to Pro</strong> for Gmail SMTP.
          </p>
        </div>
        <div className="status-grid email-status-grid">
          <div className={`status-tile ${health?.smtp_configured ? "ok" : "warn"}`}>
            <span>Mail configured</span>
            <strong>{health?.smtp_configured ? "Yes" : "Not yet"}</strong>
          </div>
          <div className="status-tile">
            <span>Method</span>
            <strong>
              {health?.email_transport === "resend"
                ? "Resend (HTTPS)"
                : health?.email_transport === "smtp"
                  ? "Gmail SMTP"
                  : "—"}
            </strong>
          </div>
          <div className="status-tile">
            <span>From address</span>
            <strong>{health?.smtp_user || "mindset@…"}</strong>
          </div>
        </div>

        <h4 className="setup-option-title">Option A — Resend (recommended on Railway Hobby)</h4>

        <div className="banner-warn email-railway-banner">
          <p>
            <strong>No DNS yet?</strong> Set <code>RESEND_SANDBOX_TO</code> to the email you used to sign up
            for Resend. All lead alerts go to that one inbox (from <code>onboarding@resend.dev</code>) until
            you verify the domain.
          </p>
        </div>

        <ol className="email-checklist">
          <li>Set <code>RESEND_API_KEY</code> on Railway</li>
          <li>
            <strong>No DNS:</strong> set <code>RESEND_SANDBOX_TO</code> = your Resend account email (e.g. the
            Gmail you signed up with)
          </li>
          <li>
            <strong>With DNS later:</strong> verify <strong>wrestlingmindset.com</strong> in Resend, remove{" "}
            <code>RESEND_SANDBOX_TO</code>, set{" "}
            <code>ROUTING_FROM_EMAIL=Leads Wrestling &lt;mindset@wrestlingmindset.com&gt;</code>
          </li>
          <li>Redeploy → Test email connection</li>
        </ol>

        <h4 className="setup-option-title">Option B — Gmail SMTP (Railway Pro only)</h4>
        <ol className="email-checklist">
          <li>Upgrade Railway workspace to <strong>Pro</strong> and redeploy</li>
          <li>App password for mindset@ (2-Step Verification on that mailbox)</li>
          <li>
            Railway vars: <code>SMTP_HOST=smtp.gmail.com</code>, <code>SMTP_PORT=587</code>,{" "}
            <code>SMTP_USER</code>, <code>SMTP_PASSWORD</code>, <code>ROUTING_FROM_EMAIL</code>
          </li>
        </ol>

        <button type="button" className="btn secondary" onClick={handleSmtpTest} disabled={smtpTesting}>
          {smtpTesting ? "Testing…" : "Test email connection"}
        </button>
      </Card>

      {wufooStatus && (
        <Card delay={40} className="setup-status-card">
          <div className="setup-status-head">
            <h3 className="setup-status-title">Right now</h3>
            <p className="setup-status-desc">
              {formConnected && hasLeads
                ? "Form is connected and leads are flowing."
                : formConnected
                  ? "Form is connected — waiting for the first submission."
                  : "Form connection still needs to be finished in Wufoo."}
            </p>
          </div>
          <div className="status-grid">
            <div className={`status-tile ${formConnected ? "ok" : "warn"}`}>
              <span>Website form</span>
              <strong>{formConnected ? "Connected" : "Not connected"}</strong>
            </div>
            <div className={`status-tile ${hasLeads ? "ok" : ""}`}>
              <span>Leads in system</span>
              <strong>{wufooStatus.cache_row_count?.toLocaleString() ?? "0"}</strong>
            </div>
            <div className="status-tile">
              <span>Last new lead</span>
              <strong>
                {wufooStatus.last_scored_at
                  ? new Date(wufooStatus.last_scored_at).toLocaleString()
                  : "None yet"}
              </strong>
            </div>
          </div>
        </Card>
      )}

      <Card
        title="Website form"
        subtitle="One-time setup in Wufoo — after this, every submission shows up in Leads"
        delay={80}
      >
        <p className="card-copy">
          This is how day-to-day leads come in. You only do this once. After that, check{" "}
          <Link to="/">Leads</Link> and <Link to="/team">Team</Link> — no uploads needed.
        </p>

        <div className="steps-list">
          <div className="step-item">
            <span className="step-num">1</span>
            <p>
              Open your form in Wufoo → <strong>Integrations</strong> → <strong>WebHook</strong>
            </p>
          </div>
          <div className="step-item">
            <span className="step-num">2</span>
            <div>
              <p>Paste this link into the WebHook URL field:</p>
              <div className="copy-row">
                <code className="copy-code">{WEBHOOK_URL}</code>
                <button type="button" className="btn secondary small" onClick={copyWebhook}>
                  Copy
                </button>
              </div>
            </div>
          </div>
          <div className="step-item">
            <span className="step-num">3</span>
            <p>
              Set the <strong>Handshake Key</strong> to the value your admin gave you (must match the server).
            </p>
          </div>
        </div>

        <p className="field-hint">
          New submissions appear in <Link to="/">Leads</Link> within about 30 seconds, then get routed on{" "}
          <Link to="/team">Team</Link>.
        </p>
      </Card>

      <Card delay={120}>
        <Accordion title="Upload a spreadsheet" subtitle="Optional — one-time import, not needed if the form is working">
          <p className="card-copy">
            Use this only when you want to bulk-load leads from a file instead of (or before) live form submissions.
          </p>

          <div className="setup-option">
            <div className="setup-option-head">
              <span className="setup-option-icon">📊</span>
              <div>
                <h4 className="setup-option-title">Already have scores?</h4>
                <p className="setup-option-desc">Import a finished Excel export — shows up instantly in Leads.</p>
              </div>
            </div>
            <label className="file-drop">
              <input type="file" accept=".xlsx" onChange={(e) => setQualifiedFile(e.target.files?.[0] || null)} />
              <span>{qualifiedFile ? qualifiedFile.name : "Choose Excel file (.xlsx)"}</span>
            </label>
            <button
              type="button"
              className="btn secondary"
              onClick={handleImportQualified}
              disabled={loading || !qualifiedFile}
            >
              Import leads
            </button>
          </div>

          <div className="setup-option-divider" />

          <div className="setup-option">
            <div className="setup-option-head">
              <span className="setup-option-icon">🔄</span>
              <div>
                <h4 className="setup-option-title">Raw HubSpot export?</h4>
                <p className="setup-option-desc">
                  Upload an unscored file and we'll score it with AI (~10 minutes for 2,000 leads).
                </p>
              </div>
            </div>
            <label className="file-drop">
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setScoreFile(e.target.files?.[0] || null)} />
              <span>{scoreFile ? scoreFile.name : "Choose HubSpot export (.xlsx or .csv)"}</span>
            </label>
            <Toggle
              checked={useLlm}
              onChange={setUseLlm}
              label="Use AI text scoring"
              description="Recommended — reads each lead's message for better accuracy"
            />
            <button type="button" className="btn" onClick={handleScore} disabled={loading || !scoreFile}>
              {loading ? "Scoring…" : "Score & save"}
            </button>
            <ScoreProgress progress={scoreProgress} />
          </div>
        </Accordion>
      </Card>

      <Card delay={160}>
        <Accordion title="Advanced — compare old vs new priority list" subtitle="For calibration reviews">
          {compareSummary?.loaded && (
            <div className="compare-pills">
              <span>Still priority: {compareSummary.still_hot}</span>
              <span>Dropped: {compareSummary.dropped_from_hot}</span>
              <span>New: {compareSummary.new_hot}</span>
            </div>
          )}
          <label className="file-drop compact">
            <input type="file" accept=".xlsx" onChange={(e) => setBaselineFile(e.target.files?.[0] || null)} />
            <span>{baselineFile ? baselineFile.name : "Previous export (.xlsx)"}</span>
          </label>
          <div className="button-row">
            <button
              type="button"
              className="btn secondary"
              disabled={loading || !baselineFile}
              onClick={async () => {
                setLoading(true);
                try {
                  await uploadBaseline(baselineFile);
                  setMessage("Baseline loaded.");
                  fetchCompareSummary().then(setCompareSummary);
                } catch (e) {
                  setError(e.message);
                } finally {
                  setLoading(false);
                }
              }}
            >
              Load baseline
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={!compareSummary?.loaded}
              onClick={() => downloadCompareExport("All").catch((e) => setError(e.message))}
            >
              Download comparison
            </button>
          </div>
          <label className="file-drop compact">
            <input type="file" accept=".xlsx" onChange={(e) => setReportFile(e.target.files?.[0] || null)} />
            <span>{reportFile ? reportFile.name : "Full tier report file"}</span>
          </label>
          <button
            type="button"
            className="btn ghost"
            disabled={!reportFile}
            onClick={() => downloadTierReport(reportFile).catch((e) => setError(e.message))}
          >
            Download full report
          </button>
        </Accordion>
      </Card>
    </>
  );
}
