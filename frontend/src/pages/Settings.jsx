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
  fetchScoringRubric,
  saveScoringRubric,
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
  const [rubric, setRubric] = useState({ Hot: 75, Warm: 50, Cold: 25 });
  const [rubricSaving, setRubricSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);

  useEffect(() => {
    checkHealth().then(setHealth);
    fetchJson("/webhooks/wufoo/status").then(setWufooStatus).catch(() => null);
    fetchCompareSummary().then(setCompareSummary).catch(() => null);
    fetchScoringRubric()
      .then((data) => {
        if (data?.tiers) setRubric(data.tiers);
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

  const handleSaveRubric = async () => {
    setRubricSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await saveScoringRubric({
        Hot: Number(rubric.Hot),
        Warm: Number(rubric.Warm),
        Cold: Number(rubric.Cold),
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
        setMessage(`Email connection OK via ${via}${result.user ? ` (${result.user})` : ""}.`);
      } else {
        setError(result.error || "Email test failed.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSmtpTesting(false);
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
        title="Scoring rubric"
        subtitle="Minimum score for each tier — saved for all new and existing leads"
        delay={20}
      >
        <p className="card-copy">
          Leads are scored 0–100. Set the cutoffs below. Priority must be highest, then Good fit, then Low
          priority.
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
        title="Rep email notifications"
        subtitle="Configured on Railway — Gmail SMTP or Resend HTTPS"
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
        <ol className="email-checklist">
          <li>
            Create a free account at{" "}
            <a href="https://resend.com" target="_blank" rel="noreferrer">
              resend.com
            </a>
          </li>
          <li>Add and verify domain <strong>wrestlingmindset.com</strong> (DNS records in Resend dashboard)</li>
          <li>Create an API key → set <code>RESEND_API_KEY</code> on Railway</li>
          <li>
            Set <code>ROUTING_FROM_EMAIL</code> to{" "}
            <code>Leads Wrestling &lt;mindset@wrestlingmindset.com&gt;</code>
          </li>
          <li>Redeploy — Resend takes priority over SMTP when the API key is set</li>
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
