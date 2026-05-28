export function resolveApiUrl() {
  let url = import.meta.env.VITE_API_URL?.trim();
  if (url) {
    // Common mistake: pasting the /health test URL instead of the API base URL
    url = url.replace(/\/health\/?$/i, "");
    return url.replace(/\/$/, "");
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
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg).join(", ")
          : `Request failed (${res.status}) at ${url}`;
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

/** Upload spreadsheet and wait for background scoring job to finish. */
export async function uploadScoreFile(file, useLlm, onProgress) {
  const data = await uploadFile("/score", file, {
    use_llm: String(useLlm),
    async_mode: "true",
  });

  if (!data.job_id) {
    return data;
  }

  onProgress?.({
    status: "running",
    phase: "starting",
    phase_label: "Starting",
    processed: 0,
    total: data.row_count ?? 0,
    percent: 0,
    progress_message: "Upload complete — starting score job…",
  });

  for (let attempt = 0; attempt < 400; attempt += 1) {
    await sleep(1500);
    const job = await fetchJson(`/score/status/${data.job_id}`);
    onProgress?.(job);

    if (job.status === "complete") {
      return job;
    }
    if (job.status === "failed") {
      throw new Error(job.detail || job.progress_message || "Scoring failed on server");
    }
  }

  throw new Error(
    "Scoring is still running on the server. Refresh Dashboard in a few minutes or check Railway logs."
  );
}
