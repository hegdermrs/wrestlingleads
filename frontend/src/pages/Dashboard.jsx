import { useCallback, useEffect, useState } from "react";

import { Link } from "react-router-dom";

import { API_URL, fetchJson } from "../api.js";

import LeadsTable from "../components/leads/LeadsTable.jsx";

import TierFilter from "../components/leads/TierFilter.jsx";

import Card from "../components/ui/Card.jsx";

import EmptyState from "../components/ui/EmptyState.jsx";

import LoadingSkeleton from "../components/ui/LoadingSkeleton.jsx";

import Toast from "../components/ui/Toast.jsx";

import Badge from "../components/ui/Badge.jsx";

import { leadDisplayName, tierLabel } from "../constants/labels.js";



const PAGE_SIZE = 50;



export default function Dashboard() {

  const [stats, setStats] = useState(null);

  const [leads, setLeads] = useState([]);

  const [recent, setRecent] = useState([]);
  const [incomingCounts, setIncomingCounts] = useState(null);

  const [total, setTotal] = useState(0);

  const [page, setPage] = useState(1);

  const [tier, setTier] = useState("All");

  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [emptyCache, setEmptyCache] = useState(false);

  const [live, setLive] = useState(false);



  const refresh = useCallback(async () => {

    setLoading(true);

    setError("");

    setEmptyCache(false);

    try {

      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });

      if (tier !== "All") params.set("tier", tier);

      if (search.trim()) params.set("search", search.trim());



      const [statsData, leadsData, recentData] = await Promise.all([

        fetchJson("/dashboard/stats"),

        fetchJson(`/dashboard/leads?${params}`),

        fetchJson("/dashboard/recent?limit=6").catch(() => ({ recent: [] })),

      ]);

      setStats(statsData);

      setLeads(leadsData.leads || []);

      setTotal(leadsData.total || 0);

      setRecent(recentData.recent || []);
      setIncomingCounts(recentData.webhook_recent_counts || null);

      if (!statsData.loaded) setEmptyCache(true);

      setLive(true);

      setTimeout(() => setLive(false), 2000);

    } catch (err) {

      setError(err.message || "Could not load leads");

    } finally {

      setLoading(false);

    }

  }, [page, tier, search]);



  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleExport = async () => {

    try {

      const params = tier !== "All" ? `?tier=${tier}` : "";

      const res = await fetch(`${API_URL}/dashboard/export${params}`);

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();

      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = url;

      link.download = `leads_export.xlsx`;

      link.click();

      window.URL.revokeObjectURL(url);

    } catch (err) {

      setError(err.message || "Export failed");

    }

  };



  const tierCounts = stats?.tier_counts || {};



  return (

    <>

      <div className="page-intro animate-fade-in">

        <div>

          <h1 className="page-title">Lead inbox</h1>

          <p className="page-subtitle">

            New form submissions appear automatically. Priority leads rise to the top.

          </p>

        </div>

        <div className="page-intro-actions">

          <span className={`live-dot ${live ? "pulse" : ""}`} title="Updates when you click Refresh" />

          <button type="button" className="btn secondary" onClick={refresh} disabled={loading}>

            Refresh

          </button>

          <button type="button" className="btn" onClick={handleExport} disabled={!stats?.loaded}>

            Download Excel

          </button>

        </div>

      </div>



      {emptyCache && !error && (

        <Card className="banner-warn" delay={50}>

          <EmptyState

            icon="📂"

            title="No leads loaded yet"

            message="Import your existing list or connect your form in Setup — takes about a minute."

            action={

              <Link to="/setup" className="btn">

                Go to Setup

              </Link>

            }

          />

        </Card>

      )}



      <Card delay={80}>

        <TierFilter
          active={tier}
          counts={tierCounts}
          incomingCounts={incomingCounts}
          total={stats?.total_leads}
          avgScore={stats?.average_score}
          onChange={(t) => {
            setTier(t);
            setPage(1);
          }}
        />

      </Card>



      {recent.length > 0 && (

        <Card title="Just came in" subtitle="Live form submissions only" delay={120}>

          <div className="recent-table-wrap">

            <table className="leads-table compact">

              <thead>

                <tr>

                  <th>Name</th>

                  <th className="num">Score</th>

                  <th>Tier</th>

                  <th>Rep</th>

                </tr>

              </thead>

              <tbody>

                {recent.map((lead, i) => (

                  <tr key={lead["Record ID"] || lead.Email || i}>

                    <td className="name-cell">{leadDisplayName(lead)}</td>

                    <td className="num score-cell">{lead["AI Score"] ?? "—"}</td>

                    <td>

                      <Badge tier={lead["AI Tier"]} showEmoji={false} />

                    </td>

                    <td>{lead["Assigned Rep"]?.split(" ")[0] || "—"}</td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        </Card>

      )}



      <Card

        title={tier === "All" ? "All leads" : `${tierLabel(tier)} leads`}

        subtitle={`${total.toLocaleString()} matching · page ${page}`}

        delay={160}

        actions={

          <input

            className="input search"

            placeholder="Search name or email…"

            value={search}

            onChange={(e) => {

              setSearch(e.target.value);

              setPage(1);

            }}

          />

        }

      >

        <Toast type="error" message={error} />



        {loading && leads.length === 0 ? (

          <LoadingSkeleton rows={4} />

        ) : leads.length === 0 ? (

          <EmptyState

            icon="🔍"

            title="No leads here"

            message={tier === "All" ? "Try a different search or import leads in Setup." : "No leads in this category right now."}

          />

        ) : (

          <>

            <LeadsTable leads={leads} />

            <div className="pagination">

              <button type="button" className="btn secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>

                ← Previous

              </button>

              <span className="muted">Page {page}</span>

              <button

                type="button"

                className="btn secondary"

                disabled={page * PAGE_SIZE >= total}

                onClick={() => setPage((p) => p + 1)}

              >

                Next →

              </button>

            </div>

          </>

        )}

      </Card>

    </>

  );

}


