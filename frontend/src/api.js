function normalizeApiBase(url) {
  let base = url.replace(/\/health\/?$/i, "").replace(/\/$/, "");
  // Direct Railway URL must not include /api — only Netlify's relative /api prefix is rewritten in netlify.toml
  if (/^https?:\/\//i.test(base) && /\/api$/i.test(base)) {
    base = base.replace(/\/api$/i, "");
  }
  return base.replace(/\/$/, "");
}

export function resolveApiUrl() {
  const url = import.meta.env.VITE_API_URL?.trim();
  if (url) {
    return normalizeApiBase(url);
  }
  if (import.meta.env.DEV) return "http://localhost:8000";
  // Production on Netlify: /api/* is proxied to Railway in netlify.toml
  return "/api";
}

export const API_URL = resolveApiUrl();

export const isLocalApi =
  API_URL.includes("localhost") ||
  API_URL.includes("127.0.0.1") ||
  API_URL === "/api";

/** True when the UI and API are on different origins (e.g. Netlify → Railway). */
export const isCrossOriginApi =
  typeof window !== "undefined" &&
  API_URL.startsWith("http") &&
  !API_URL.startsWith(window.location.origin);

export async function fetchJson(path, options = {}) {
  const url = `${API_URL}${path}`;
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    const hint = isLocalApi
      ? "Start the backend with start-backend.bat (http://localhost:8000)."
      : isCrossOriginApi
        ? "Upload timed out or connection dropped. Use the latest deploy with background scoring, or score locally."
        : "Check Netlify /api proxy or set VITE_API_URL to your Railway base URL (not /health), then redeploy.";
    throw new Error(`Cannot reach API at ${url}. ${hint}`);
  }
  const text = await res.text();

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `Cannot reach API at ${url}. Check Railway is running and Netlify /api proxy is configured.`
      );
    }
  }

  if (!res.ok) {
    const detail = data?.detail;
    let message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg).join(", ")
          : `Request failed (${res.status}) at ${url}`;
    if (
      res.status === 404 &&
      message === "Not Found" &&
      path.startsWith("/auth")
    ) {
      message =
        "Auth API not found. Set VITE_API_URL to your Railway URL without /api (e.g. https://wrestlingleads-production.up.railway.app), then redeploy Netlify.";
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return data;
}

export async function checkHealth() {
  try {
    return await fetchJson("/health");
  } catch {
    return { status: "offline" };
  }
}

export function loginWithPassword(password) {
  return fetchJson("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

export function changeAppPassword({ current_password, new_password, confirm_password }) {
  return fetchJson("/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password, new_password, confirm_password }),
  });
}

export async function uploadFile(path, file, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_URL}${path}${qs ? `?${qs}` : ""}`;
  const form = new FormData();
  form.append("file", file);
  let res;
  try {
    res = await fetch(url, { method: "POST", body: form });
  } catch {
    const hint = isLocalApi
      ? "Start the backend with start-backend.bat (http://localhost:8000)."
      : isCrossOriginApi
        ? "Upload timed out or connection dropped. Use the latest deploy with background scoring, or score locally."
        : "Check Netlify /api proxy or set VITE_API_URL to your Railway base URL (not /health), then redeploy.";
    throw new Error(`Cannot reach API at ${url}. ${hint}`);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Upload failed — non-JSON response from ${url}`);
  }
  if (!res.ok) {
    throw new Error(
      typeof data?.detail === "string" ? data.detail : `Upload failed (${res.status})`
    );
  }
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonRetry(path, retries = 5) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await fetchJson(path);
    } catch (err) {
      lastError = err;
      if (err.status && err.status !== 404) {
        throw err;
      }
      if (attempt < retries - 1) {
        await sleep(800 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

async function fetchDashboardStats() {
  try {
    return await fetchJsonRetry("/dashboard/stats", 3);
  } catch {
    return null;
  }
}

/** Upload spreadsheet and wait for background scoring job to finish. */
export async function uploadScoreFile(file, useLlm, onProgress) {
  const data = await uploadFile("/score", file, {
    use_llm: String(useLlm),
    async_mode: "true",
  });

  if (!data.job_id) {
    return data;
  }

  const expectedRows = data.row_count ?? 0;
  let lastJob = null;
  let networkErrors = 0;

  onProgress?.({
    status: "running",
    phase: "starting",
    phase_label: "Starting",
    processed: 0,
    total: expectedRows,
    percent: 0,
    progress_message: "Upload complete — starting score job…",
  });

  for (let attempt = 0; attempt < 600; attempt += 1) {
    await sleep(2000);

    try {
      const job = await fetchJsonRetry(`/score/status/${data.job_id}`, 4);
      networkErrors = 0;
      lastJob = job;
      onProgress?.(job);

      if (job.status === "complete") {
        return job;
      }
      if (job.status === "failed") {
        throw new Error(job.detail || job.progress_message || "Scoring failed on server");
      }
    } catch (err) {
      if (err.status === 404) {
        const stats = await fetchDashboardStats();
        if (stats?.loaded && stats.total_leads >= expectedRows) {
          return {
            status: "complete",
            row_count: stats.total_leads,
            summary: stats,
            progress_message: "Scoring finished — dashboard cache loaded",
          };
        }
      }

      networkErrors += 1;
      onProgress?.({
        ...(lastJob || {}),
        status: "running",
        progress_message: `Connection hiccup — retrying (${networkErrors})… keep tab open`,
      });

      if (networkErrors >= 15) {
        const stats = await fetchDashboardStats();
        if (stats?.loaded && stats.total_leads > 0) {
          return {
            status: "complete",
            row_count: stats.total_leads,
            summary: stats,
            progress_message: "Scoring likely finished — dashboard has data",
          };
        }
        throw err;
      }
    }
  }

  const stats = await fetchDashboardStats();
  if (stats?.loaded && stats.total_leads >= expectedRows) {
    return {
      status: "complete",
      row_count: stats.total_leads,
      summary: stats,
      progress_message: "Scoring finished — dashboard cache loaded",
    };
  }

  throw new Error(
    "Scoring may still be running on the server. Refresh Dashboard in a few minutes."
  );
}

export async function fetchCompareSummary() {
  try {
    return await fetchJson("/dashboard/compare/summary");
  } catch {
    return { loaded: false };
  }
}

export async function uploadBaseline(file) {
  return uploadFile("/settings/import-baseline", file);
}

export async function downloadCompareExport(tier = "All") {
  const params = tier !== "All" ? `?tier=${encodeURIComponent(tier)}` : "";
  const url = `${API_URL}/dashboard/export-compare${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    let detail = "Compare export failed";
    try {
      detail = JSON.parse(text).detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `leads_${tier.toLowerCase()}_tier_compare.xlsx`;
  link.click();
  window.URL.revokeObjectURL(blobUrl);
}

export async function downloadTierReport(file) {
  const url = `${API_URL}/settings/run-tier-report`;
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text();
    let detail = "Tier report failed";
    try {
      detail = JSON.parse(text).detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = "hot_tier_comparison.xlsx";
  link.click();
  window.URL.revokeObjectURL(blobUrl);
}

export function fetchRoutingRules() {
  return fetchJson("/routing/rules");
}

export function saveRoutingRules(rules) {
  return fetchJson("/routing/rules", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rules),
  });
}

export function fetchRoutingStats() {
  return fetchJson("/routing/stats");
}

export function fetchWufooForms() {
  return fetchJson("/webhooks/wufoo/forms");
}

export function sendRoute(email, { force = false, send_email = true } = {}) {
  return fetchJson("/routing/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, force, send_email }),
  });
}

export function sendUnrouted() {
  return fetchJson("/routing/send-unrouted", { method: "POST" });
}

export function testSmtpConnection() {
  return fetchJson("/routing/smtp-test", { method: "POST" });
}

export function testN8nWebhook() {
  return fetchJson("/routing/n8n-test", { method: "POST" });
}

export function testHubspotConnection() {
  return fetchJson("/routing/hubspot-test", { method: "POST" });
}

export function fetchHubspotOwners() {
  return fetchJson("/routing/hubspot-owners");
}

export function fetchScoringRubric() {
  return fetchJson("/scoring/rubric");
}

export function fetchIcpProfile() {
  return fetchJson("/scoring/icp-profile");
}

export function saveIcpProfile(profile) {
  return fetchJson("/scoring/icp-profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
}

export function saveScoringRubric({ tiers, coaching_score_boost = 8, icp_llm_min = 68 }) {
  return fetchJson("/scoring/rubric", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tiers, coaching_score_boost, icp_llm_min }),
  });
}
