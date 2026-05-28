import { useCallback, useEffect, useState } from "react";
import { API_URL, fetchJson } from "../api.js";

const TIERS = ["All", "Hot", "Warm", "Cold", "Unqualified"];

const tierClass = {
  Hot: "tier-hot",
  Warm: "tier-warm",
  Cold: "tier-cold",
  Unqualified: "tier-unqualified",
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [recent, setRecent] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tier, setTier] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [emptyCache, setEmptyCache] = useState(false);

  const loadStats = useCallback(async () => {
    return fetchJson("/dashboard/stats");
  }, []);

  const loadLeads = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (tier !== "All") params.set("tier", tier);
    if (search.trim()) params.set("search", search.trim());

    try {
      return await fetchJson(`/dashboard/leads?${params}`);
    } catch (err) {
      if (err.status === 404) {
        setEmptyCache(true);
        return { total: 0, leads: [] };
      }
      throw err;
    }
  }, [page, tier, search]);

  const loadRecent = useCallback(async () => {
    try {
      return await fetchJson("/dashboard/recent?limit=5");
    } catch {
      return { recent: [] };
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    setEmptyCache(false);
    try {
      const [statsData, leadsData, recentData] = await Promise.all([
        loadStats(),
        loadLeads(),
        loadRecent(),
      ]);
      setStats(statsData);
      setLeads(leadsData.leads || []);
      setTotal(leadsData.total || 0);
      setRecent(recentData.recent || []);
      if (!statsData.loaded) setEmptyCache(true);
    } catch (err) {
      setError(err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [loadStats, loadLeads, loadRecent]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleExport = async () => {
    try {
      const params = tier !== "All" ? `?tier=${tier}` : "";
      const res = await fetch(`${API_URL}/dashboard/export${params}`);
      if (!res.ok) {
        const text = await res.text();
        let detail = "Export failed";
        try {
          detail = JSON.parse(text).detail || detail;
        } catch {
          /* ignore */
        }
        setError(detail);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `leads_${tier.toLowerCase()}_export.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Export failed");
    }
  };

  const tierCounts = stats?.tier_counts || {};
  const lastUpdated = stats?.meta?.scored_at
    ? new Date(stats.meta.scored_at).toLocaleString()
    : "—";

  return (
    <>
      {emptyCache && !error && (
        <section className="panel banner-warn">
          <strong>No leads loaded on the server yet.</strong>
          <p className="muted">
            Go to <a href="/settings">Settings</a> and import your <code>qualified.xlsx</code> file
            (fastest — no re-scoring), or upload and score a new export.
          </p>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Lead Dashboard</h2>
            <p className="muted">
              Qualification view excludes Customers (training data only).
              {stats?.customers_excluded ? ` ${stats.customers_excluded} customers hidden.` : ""}
            </p>
          </div>
          <div className="panel-actions">
            <span className="muted">Last updated: {lastUpdated}</span>
            <button className="secondary" onClick={refresh} disabled={loading}>
              Refresh
            </button>
            <button onClick={handleExport} disabled={!stats?.loaded}>
              Export {tier !== "All" ? tier : "All"}
            </button>
          </div>
        </div>

        <div className="stat-cards">
          <button
            className={`stat-card ${tier === "All" ? "active" : ""}`}
            onClick={() => { setTier("All"); setPage(1); }}
          >
            <span className="stat-label">Total Leads</span>
            <span className="stat-value">{stats?.total_leads ?? "—"}</span>
            <span className="stat-sub">Avg score {stats?.average_score ?? "—"}</span>
          </button>
          {["Hot", "Warm", "Cold", "Unqualified"].map((t) => (
            <button
              key={t}
              className={`stat-card ${tierClass[t]} ${tier === t ? "active" : ""}`}
              onClick={() => { setTier(t); setPage(1); }}
            >
              <span className="stat-label">{t}</span>
              <span className="stat-value">{tierCounts[t] ?? 0}</span>
              <span className="stat-sub">
                Avg {stats?.tier_stats?.[t]?.avg_ai_score ?? "—"}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Recent Incoming Leads</h3>
        <p className="muted">
          Wufoo submissions appear here automatically once webhook is configured at{" "}
          <code>/webhooks/wufoo</code>
        </p>
        {recent.length === 0 ? (
          <p className="muted">No recent leads yet.</p>
        ) : (
          <div className="recent-list">
            {recent.map((lead, i) => (
              <div key={lead["Record ID"] || lead.Email || i} className="recent-item">
                <strong>{`${lead["First Name"] || ""} ${lead["Last Name"] || ""}`.trim() || lead.Email}</strong>
                <span className={`badge ${tierClass[lead["AI Tier"]] || ""}`}>{lead["AI Tier"]}</span>
                <span>{lead["AI Score"]}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>{tier === "All" ? "All Leads" : `${tier} Leads`}</h3>
          <input
            className="search-input"
            placeholder="Search name, email, reasons..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        {error && <p className="error">{error}</p>}
        {loading ? (
          <p className="muted">Loading...</p>
        ) : leads.length === 0 ? (
          <p className="muted">No leads found. Import or score leads in Settings.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Score</th>
                    <th>Tier</th>
                    <th>Action</th>
                    <th>Reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((row, i) => (
                    <tr key={row["Record ID"] || row.Email || i}>
                      <td>{`${row["First Name"] || ""} ${row["Last Name"] || ""}`.trim() || row.Email || "—"}</td>
                      <td>{row.Email}</td>
                      <td>{row["AI Score"]}</td>
                      <td>
                        <span className={`badge ${tierClass[row["AI Tier"]] || ""}`}>
                          {row["AI Tier"]}
                        </span>
                      </td>
                      <td>{row["Recommended Action"]}</td>
                      <td className="reasons">{row["AI Reasons"]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button
                className="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="muted">
                Page {page} · {total} leads
              </span>
              <button
                className="secondary"
                disabled={page * 50 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
