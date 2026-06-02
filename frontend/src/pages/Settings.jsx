import { useEffect, useState } from "react";
import ScoreProgress from "../components/ScoreProgress.jsx";
import { API_URL, checkHealth, downloadCompareExport, downloadTierReport, fetchCompareSummary, fetchJson, isCrossOriginApi, uploadBaseline, uploadFile, uploadScoreFile } from "../api.js";

const RAILWAY_API_URL = "https://wrestlingleads-production.up.railway.app";

export default function Settings() {
  const [file, setFile] = useState(null);
  const [qualifiedFile, setQualifiedFile] = useState(null);
  const [baselineFile, setBaselineFile] = useState(null);
  const [reportFile, setReportFile] = useState(null);
  const [useLlm, setUseLlm] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [scoreProgress, setScoreProgress] = useState(null);
  const [compareSummary, setCompareSummary] = useState(null);
  const [wufooStatus, setWufooStatus] = useState(null);

  const refreshCompare = () => fetchCompareSummary().then(setCompareSummary);

  useEffect(() => {
    checkHealth().then(setHealth);
    fetchJson("/metrics").then(setMetrics).catch(() => setMetrics(null));
    fetchJson("/webhooks/wufoo/status").then(setWufooStatus).catch(() => setWufooStatus(null));
    refreshCompare();
  }, []);

  const handleScore = async () => {
    if (!file) {
      setError("Please select a spreadsheet first.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    setScoreProgress(null);

    try {
      const data = await uploadScoreFile(file, useLlm, setScoreProgress);
      const count = data.row_count ?? data.summary?.total_leads ?? "?";
      setScoreProgress((prev) => ({
        ...prev,
        status: "complete",
        percent: 100,
        phase_label: "Complete",
        progress_message: `Done — ${count} leads scored`,
      }));
      setMessage(`Scored ${count} leads. Open Dashboard to view and export instantly.`);
      checkHealth().then(setHealth);
    } catch (err) {
      setError(err.message || "Something went wrong");
      setScoreProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const handleImportQualified = async () => {
    if (!qualifiedFile) {
      setError("Please select your qualified.xlsx file.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const data = await uploadFile("/settings/import-qualified", qualifiedFile);
      setMessage(`Imported ${data.row_count} pre-scored leads to dashboard cache.`);
      checkHealth().then(setHealth);
      refreshCompare();
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const handleImportBaseline = async () => {
    if (!baselineFile) {
      setError("Please select your previous qualified.xlsx export.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await uploadBaseline(baselineFile);
      setCompareSummary(data.summary);
      setMessage(`Baseline loaded (${data.row_count} rows). Use Compare Export or full report below.`);
      checkHealth().then(setHealth);
    } catch (err) {
      setError(err.message || "Baseline import failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCompareExport = async () => {
    setLoading(true);
    setError("");
    try {
      await downloadCompareExport("All");
      setMessage("Downloaded tier compare export with Previous Tier and Tier Change columns.");
    } catch (err) {
      setError(err.message || "Compare export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleTierReport = async () => {
    if (!reportFile) {
      setError("Select your previous qualified.xlsx for the full Hot tier report.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await downloadTierReport(reportFile);
      setMessage("Downloaded hot_tier_comparison.xlsx — share Client Review Template sheet with client.");
    } catch (err) {
      setError(err.message || "Tier report failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRetrain = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/train`, { method: "POST" });
      if (!response.ok) throw new Error("Retrain failed");
      const data = await response.json();
      setMetrics(data.metrics);
      setMessage("Model retrained successfully.");
    } catch (err) {
      setError(err.message || "Retrain failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section className="panel">
        <h2>Settings</h2>
        <p className="muted">
          Score new exports or import an existing qualified file. Dashboard reads from cache — no re-scoring on export.
        </p>
        <div className="status-card inline-status">
          <span>API: {health?.status === "ok" ? "Online" : "Offline"}</span>
          <span>URL: <code>{API_URL}</code></span>
          {API_URL.includes("localhost") && !window.location.hostname.includes("localhost") && (
            <span className="error-inline">Still using localhost — redeploy Netlify or wait for /api proxy build</span>
          )}
          <span>Model: {health?.model_ready ? "Ready" : "Not trained"}</span>
          <span>Cache: {health?.cache_loaded ? "Loaded" : "Empty"}</span>
          <span>Baseline: {health?.baseline_loaded || compareSummary?.baseline_loaded ? "Loaded" : "None"}</span>
          <span>DeepSeek: {health?.llm_configured ? "Configured" : "Not set"}</span>
          {isCrossOriginApi && (
            <span className="muted">
              Bulk scoring runs in the background (~10 min for 2k leads) — keep this tab open while polling.
            </span>
          )}
          {API_URL === "/api" && (
            <span className="error-inline">
              /api proxy times out on long scores (~10 min). Set VITE_API_URL to Railway URL for uploads.
            </span>
          )}
        </div>
      </section>

      <section className="panel">
        <h3>Compare with Previous Export</h3>
        <p className="muted">
          Upload your old qualified.xlsx to see who moved in/out of Hot. Export includes{" "}
          <code>Previous AI Tier</code>, <code>Tier Change</code>, and client review columns.
        </p>
        {compareSummary?.loaded && (
          <div className="compare-stats">
            <span>Still Hot: {compareSummary.still_hot}</span>
            <span>Dropped from Hot: {compareSummary.dropped_from_hot}</span>
            <span>New Hot: {compareSummary.new_hot}</span>
            <span>Investigate: {compareSummary.investigate_count}</span>
          </div>
        )}
        <div className="controls">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setBaselineFile(e.target.files?.[0] || null)}
          />
          <div className="button-row">
            <button onClick={handleImportBaseline} disabled={loading || !baselineFile}>
              {loading ? "Working…" : "Load Baseline"}
            </button>
            <button className="secondary" onClick={handleCompareExport} disabled={loading || !compareSummary?.loaded}>
              Download Compare Export
            </button>
          </div>
          <p className="muted">Or generate the full multi-sheet report (Dropped / New / Client Review Template):</p>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setReportFile(e.target.files?.[0] || null)}
          />
          <button onClick={handleTierReport} disabled={loading || !reportFile || !health?.cache_loaded}>
            {loading ? "Working…" : "Download Full Hot Tier Report"}
          </button>
        </div>
      </section>

      <section className="panel">
        <h3>Import Pre-Scored File</h3>
        <p className="muted">Load your qualified.xlsx without re-running DeepSeek (~instant).</p>
        <div className="controls">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setQualifiedFile(e.target.files?.[0] || null)}
          />
          <button onClick={handleImportQualified} disabled={loading || !qualifiedFile}>
            {loading ? "Working..." : "Import to Dashboard"}
          </button>
        </div>
      </section>

      <section className="panel">
        <h3>Score New Export</h3>
        <div className="controls">
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <label className="checkbox">
            <input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} />
            Use DeepSeek text scoring (parallel, ~10 min for 2k leads)
          </label>
          <div className="button-row">
            <button onClick={handleScore} disabled={loading || !file}>
              {loading ? "Scoring…" : "Score & Save to Dashboard"}
            </button>
            <button className="secondary" onClick={handleRetrain} disabled={loading}>
              Retrain Model
            </button>
          </div>
          <ScoreProgress progress={scoreProgress} />
        </div>
      </section>

      <section className="panel">
        <h3>Wufoo Webhook</h3>
        <p className="muted">
          Wufoo must POST directly to Railway (not the Netlify site URL for uploads).
        </p>
        <ul className="muted" style={{ marginTop: "0.5rem" }}>
          <li>
            <strong>Webhook URL:</strong>{" "}
            <code>{RAILWAY_API_URL}/webhooks/wufoo</code>
          </li>
          <li>
            <strong>Handshake Key</strong> (in Wufoo): must exactly match{" "}
            <code>WUFOO_WEBHOOK_SECRET</code> on Railway
          </li>
          <li>Field map: <code>config/wufoo_field_map.json</code></li>
        </ul>
        {wufooStatus && (
          <div className="metric-grid" style={{ marginTop: "1rem" }}>
            <div>
              <strong>Secret on server</strong>
              <span>{wufooStatus.secret_configured ? "Yes" : "No — webhooks rejected or insecure"}</span>
            </div>
            <div>
              <strong>Field map</strong>
              <span>{wufooStatus.field_map_loaded ? `${wufooStatus.mapped_field_count} fields` : "Missing"}</span>
            </div>
            <div>
              <strong>Leads in cache</strong>
              <span>{wufooStatus.cache_row_count ?? "—"}</span>
            </div>
            <div>
              <strong>Last lead scored</strong>
              <span>{wufooStatus.last_scored_at ? new Date(wufooStatus.last_scored_at).toLocaleString() : "—"}</span>
            </div>
          </div>
        )}
        <p className="muted" style={{ marginTop: "0.75rem" }}>
          After a form submit, wait ~30 seconds and click <strong>Refresh</strong> on Dashboard.
          New leads often land as <strong>Warm</strong> — use tier <strong>All</strong> or check{" "}
          <strong>Recent Incoming Leads</strong>.
        </p>
      </section>

      {metrics && (
        <section className="panel metrics">
          <h3>Model Metrics</h3>
          <div className="metric-grid">
            <div><strong>ROC AUC</strong><span>{metrics.roc_auc?.toFixed(3)}</span></div>
            <div><strong>Precision</strong><span>{metrics.precision?.toFixed(3)}</span></div>
            <div><strong>Recall</strong><span>{metrics.recall?.toFixed(3)}</span></div>
            <div><strong>Hot Tier Precision</strong><span>{metrics.hot_tier_precision?.toFixed(3)}</span></div>
          </div>
        </section>
      )}

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
    </>
  );
}
