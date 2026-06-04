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
  saveIcpProfile,
  testHubspotConnection,
  testN8nWebhook,
  testSmtpConnection,
  uploadBaseline,
  uploadFile,
  uploadScoreFile,
} from "../api.js";

const WEBHOOK_URL = "https://wrestlingleads-production.up.railway.app/webhooks/wufoo";

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
  const [icpSummary, setIcpSummary] = useState("");
  const [icpSaving, setIcpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [n8nTesting, setN8nTesting] = useState(false);
  const [hubspotTesting, setHubspotTesting] = useState(false);

  useEffect(() => {
    checkHealth().then(setHealth);
    fetchJson("/webhooks/wufoo/status").then(setWufooStatus).catch(() => null);
    fetchCompareSummary().then(setCompareSummary).catch(() => null);
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
      setMessage("Saved — new leads will be scored using this description.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIcpSaving(false);
    }
  };

  const handleSmtpTest = async () => {
    setSmtpTesting(true);
    setError("");
    setMessage("");
    try {
      const result = await testSmtpConnection();
      if (result.ok) {
        const note = result.note ? ` ${result.note}` : "";
        setMessage(`Email is working.${note}`);
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
        setMessage(result.note || "Test sent — check your automation workflow.");
      } else {
        setError(result.error || "Automation test failed.");
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
        setMessage(result.note || "HubSpot is connected.");
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
            Connect your form once, then manage your team and priorities on the other tabs.
          </p>
        </div>
        <div className={`status-pill ${health?.status === "ok" ? "ok" : "warn"}`}>
          {health?.status === "ok" ? "● Online" : "○ Offline"}
        </div>
      </div>

      <Toast type="success" message={message} />
      <Toast type="error" message={error} />

      {wufooStatus && (
        <Card delay={10} className="setup-status-card">
          <div className="setup-status-head">
            <h3 className="setup-status-title">Right now</h3>
            <p className="setup-status-desc">
              {formConnected && hasLeads
                ? "Your form is connected and leads are coming in."
                : formConnected
                  ? "Form is connected — waiting for the first submission."
                  : "Finish connecting your form below."}
            </p>
          </div>
          <div className="status-grid">
            <div className={`status-tile ${formConnected ? "ok" : "warn"}`}>
              <span>Website form</span>
              <strong>{formConnected ? "Connected" : "Not connected"}</strong>
            </div>
            <div className={`status-tile ${hasLeads ? "ok" : ""}`}>
              <span>Leads loaded</span>
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
        title="Connect your website form"
        subtitle="One-time setup in Wufoo — then every submission shows up in Leads"
        delay={20}
      >
        <p className="card-copy">
          This is how leads arrive day to day. After this, use <Link to="/">Leads</Link> and{" "}
          <Link to="/team">Team</Link> — no spreadsheets required.
        </p>

        <div className="steps-list">
          <div className="step-item">
            <span className="step-num">1</span>
            <p>
              In Wufoo, open your form → <strong>Integrations</strong> → <strong>WebHook</strong>
            </p>
          </div>
          <div className="step-item">
            <span className="step-num">2</span>
            <div>
              <p>Paste this address into the WebHook URL box:</p>
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
              Enter the <strong>Handshake Key</strong> your admin gave you so submissions are accepted.
            </p>
          </div>
        </div>

        <p className="field-hint">
          New leads usually appear in <Link to="/">Leads</Link> within about 30 seconds, then assign on{" "}
          <Link to="/team">Team</Link>.
        </p>
      </Card>

      <Card
        title="Your ideal lead"
        subtitle="Helps rank new parents and athletes the way you would"
        delay={40}
      >
        <p className="card-copy">
          Describe the parent or athlete you most want to coach — ready to start, serious goals, real need. The
          better this paragraph, the smarter the Priority / Good fit labels in your inbox.
        </p>
        <label className="field-label" htmlFor="icp-summary">
          Ideal lead description
        </label>
        <textarea
          id="icp-summary"
          className="input"
          rows={5}
          value={icpSummary}
          onChange={(e) => setIcpSummary(e.target.value)}
          placeholder="Example: parent of a high-school wrestler, mental game struggles, wants Fargo-level results, ready to start coaching soon…"
        />
        <button
          type="button"
          className="btn secondary"
          style={{ marginTop: "0.75rem" }}
          onClick={handleSaveIcp}
          disabled={icpSaving || !icpSummary.trim()}
        >
          {icpSaving ? "Saving…" : "Save description"}
        </button>
      </Card>

      <Card title="Who gets which leads" subtitle="On the Team page" delay={50}>
        <p className="card-copy">
          Open <Link to="/team">Team</Link> → section <strong>Lead distribution &amp; rules</strong> to set
          percentages and inbox labels in one table. Click <strong>Save changes</strong> when done.
        </p>
      </Card>

      <Card delay={60}>
        <Accordion
          title="Email, HubSpot & automation"
          subtitle="For your admin or developer — optional until you want rep emails or CRM sync"
        >
          <div className="status-grid email-status-grid" style={{ marginBottom: "1rem" }}>
            <div className={`status-tile ${health?.smtp_configured ? "ok" : "warn"}`}>
              <span>Rep email</span>
              <strong>{health?.smtp_configured ? "Ready" : "Not set up"}</strong>
            </div>
            <div className={`status-tile ${health?.n8n_configured ? "ok" : "warn"}`}>
              <span>Email automation</span>
              <strong>{health?.n8n_configured ? "Ready" : "Not set up"}</strong>
            </div>
            <div className={`status-tile ${health?.hubspot_configured ? "ok" : "warn"}`}>
              <span>HubSpot</span>
              <strong>{health?.hubspot_configured ? "Ready" : "Not set up"}</strong>
            </div>
          </div>

          <h4 className="setup-option-title">Rep email</h4>
          <p className="card-copy">
            Your hosting admin adds email settings, then you turn on <strong>Email the assigned rep</strong> on
            Team. Use the test below to confirm reps get notified.
          </p>
          <button
            type="button"
            className="btn secondary"
            onClick={handleSmtpTest}
            disabled={smtpTesting}
            style={{ marginBottom: "1.25rem" }}
          >
            {smtpTesting ? "Testing…" : "Test rep email"}
          </button>

          <h4 className="setup-option-title">Automation (n8n)</h4>
          <p className="card-copy">
            If you use n8n, connect a webhook workflow so it can send Gmail or Outlook when a lead is assigned.
            Then enable <strong>Email the assigned rep</strong> on Team.
          </p>
          <button type="button" className="btn secondary" onClick={handleN8nTest} disabled={n8nTesting}>
            {n8nTesting ? "Sending test…" : "Test automation"}
          </button>
          <p className="field-hint" style={{ marginTop: "0.75rem" }}>
            <strong>HubSpot owner in n8n:</strong> if Contact Owner says “value not supported”, use{" "}
            <strong>Custom Properties</strong> → property <code>hubspot_owner_id</code> → value{" "}
            <code>{`{{ $json.body.rep.hubspot_owner_id }}`}</code> (must be a number from a real route, not the
            Setup test). Or expression mode: <code>{`{{ Number($json.body.rep.hubspot_owner_id) }}`}</code>. Rep
            email on Team must match HubSpot Users.
          </p>

          <h4 className="setup-option-title" style={{ marginTop: "1.25rem" }}>
            HubSpot
          </h4>
          <p className="card-copy">
            When connected, assigning a lead can update the HubSpot contact. Turn on{" "}
            <strong>Update HubSpot when assigned</strong> on Team.
          </p>
          <button type="button" className="btn secondary" onClick={handleHubspotTest} disabled={hubspotTesting}>
            {hubspotTesting ? "Testing…" : "Test HubSpot"}
          </button>

          <p className="field-hint" style={{ marginTop: "1rem" }}>
            Need step-by-step env vars (Railway, Resend, tokens)? Ask whoever deployed the app — those details
            stay in their deployment notes, not in this screen.
          </p>
        </Accordion>
      </Card>

      <Card delay={120}>
        <Accordion title="Import from a spreadsheet" subtitle="Optional — only if you are not using the live form yet">
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
                <h4 className="setup-option-title">Have a raw export?</h4>
                <p className="setup-option-desc">
                  Upload an unscored list and we&apos;ll rank it for you (about 10 minutes for 2,000 rows).
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
              label="Read each lead's message"
              description="Recommended — understands what they wrote, not just form fields"
            />
            <button type="button" className="btn" onClick={handleScore} disabled={loading || !scoreFile}>
              {loading ? "Scoring…" : "Score & save"}
            </button>
            <ScoreProgress progress={scoreProgress} />
          </div>
        </Accordion>
      </Card>

      <Card delay={160}>
        <Accordion title="Compare old vs new priority list" subtitle="Optional — for reviewing scoring changes">
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
