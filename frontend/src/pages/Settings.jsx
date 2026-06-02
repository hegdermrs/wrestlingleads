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

  useEffect(() => {
    checkHealth().then(setHealth);
    fetchJson("/webhooks/wufoo/status").then(setWufooStatus).catch(() => null);
    fetchCompareSummary().then(setCompareSummary).catch(() => null);
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
    } catch (err) {
      setError(err.message);
      setScoreProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const copyWebhook = () => {
    navigator.clipboard?.writeText(WEBHOOK_URL);
    setMessage("Webhook link copied!");
  };

  return (
    <>
      <div className="page-intro animate-fade-in">
        <div>
          <h1 className="page-title">Setup</h1>
          <p className="page-subtitle">Import your list, connect your form, and you're live.</p>
        </div>
        <div className={`status-pill ${health?.status === "ok" ? "ok" : "warn"}`}>
          {health?.status === "ok" ? "● System online" : "○ Offline"}
        </div>
      </div>

      <Toast type="success" message={message} />
      <Toast type="error" message={error} />

      <Card title="Step 1 — Load your leads" subtitle="Fastest: import a file you've already scored" delay={60}>
        <p className="card-copy">
          Have an Excel export with scores already? Upload it here — shows up instantly in{" "}
          <Link to="/">Leads</Link>.
        </p>
        <label className="file-drop">
          <input type="file" accept=".xlsx" onChange={(e) => setQualifiedFile(e.target.files?.[0] || null)} />
          <span>{qualifiedFile ? qualifiedFile.name : "Choose Excel file (.xlsx)"}</span>
        </label>
        <button type="button" className="btn" onClick={handleImportQualified} disabled={loading || !qualifiedFile}>
          Import leads
        </button>
      </Card>

      <Card title="Step 2 — Connect your form" subtitle="Wufoo sends new submissions automatically" delay={100}>
        <div className="steps-list">
          <div className="step-item">
            <span className="step-num">1</span>
            <p>In Wufoo → your form → <strong>Integrations → WebHook</strong></p>
          </div>
          <div className="step-item">
            <span className="step-num">2</span>
            <p>Paste this URL:</p>
            <div className="copy-row">
              <code className="copy-code">{WEBHOOK_URL}</code>
              <button type="button" className="btn secondary small" onClick={copyWebhook}>
                Copy
              </button>
            </div>
          </div>
          <div className="step-item">
            <span className="step-num">3</span>
            <p>Set the Handshake Key to match what your admin configured on the server</p>
          </div>
        </div>
        {wufooStatus && (
          <div className="status-grid">
            <div className={`status-tile ${wufooStatus.secret_configured ? "ok" : "warn"}`}>
              <span>Form security</span>
              <strong>{wufooStatus.secret_configured ? "Connected" : "Needs setup"}</strong>
            </div>
            <div className="status-tile ok">
              <span>Leads loaded</span>
              <strong>{wufooStatus.cache_row_count?.toLocaleString() ?? "—"}</strong>
            </div>
            <div className="status-tile">
              <span>Last new lead</span>
              <strong>
                {wufooStatus.last_scored_at
                  ? new Date(wufooStatus.last_scored_at).toLocaleString()
                  : "—"}
              </strong>
            </div>
          </div>
        )}
        <p className="field-hint">
          New submissions appear in <Link to="/">Leads</Link> within ~30 seconds, then route to your team in{" "}
          <Link to="/team">Team</Link>.
        </p>
      </Card>

      <Card title="Step 3 — Score a fresh HubSpot export" subtitle="Optional — takes ~10 minutes for 2,000 leads" delay={140}>
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
      </Card>

      <Card delay={180}>
        <Accordion title="Advanced — compare old vs new Hot list" subtitle="For calibration reviews">
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
