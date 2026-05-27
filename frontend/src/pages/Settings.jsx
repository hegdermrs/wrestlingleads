import { useEffect, useState } from "react";
import { API_URL, checkHealth, fetchJson, isLocalApi } from "../api.js";

export default function Settings() {
  const [file, setFile] = useState(null);
  const [qualifiedFile, setQualifiedFile] = useState(null);
  const [useLlm, setUseLlm] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    checkHealth().then(setHealth);
    fetchJson("/metrics").then(setMetrics).catch(() => setMetrics(null));
  }, []);

  const handleScore = async () => {
    if (!file) {
      setError("Please select a spreadsheet first.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");

    const form = new FormData();
    form.append("file", file);

    try {
      const response = await fetch(`${API_URL}/score?use_llm=${useLlm}`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const detail = await response.json();
        throw new Error(detail.detail || "Scoring failed");
      }
      const data = await response.json();
      setMessage(`Scored ${data.row_count} leads. Open Dashboard to view and export instantly.`);
    } catch (err) {
      setError(err.message || "Something went wrong");
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

    const form = new FormData();
    form.append("file", qualifiedFile);

    try {
      const response = await fetch(`${API_URL}/settings/import-qualified`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const detail = await response.json();
        throw new Error(detail.detail || "Import failed");
      }
      const data = await response.json();
      setMessage(`Imported ${data.row_count} pre-scored leads to dashboard cache.`);
    } catch (err) {
      setError(err.message || "Import failed");
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
          {isLocalApi && !window.location.hostname.includes("localhost") && (
            <span className="error-inline">VITE_API_URL not set — redeploy Netlify with Railway URL</span>
          )}
          <span>Model: {health?.model_ready ? "Ready" : "Not trained"}</span>
          <span>Cache: {health?.cache_loaded ? "Loaded" : "Empty"}</span>
          <span>DeepSeek: {health?.llm_configured ? "Configured" : "Not set"}</span>
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
              {loading ? "Working..." : "Score & Save to Dashboard"}
            </button>
            <button className="secondary" onClick={handleRetrain} disabled={loading}>
              Retrain Model
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>Wufoo Webhook</h3>
        <p className="muted">
          Point Wufoo to <code>{API_URL}/webhooks/wufoo</code>. Map field IDs in{" "}
          <code>config/wufoo_field_map.json</code>. Set <code>WUFOO_WEBHOOK_SECRET</code> in .env.
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
