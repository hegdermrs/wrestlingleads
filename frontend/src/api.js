export function resolveApiUrl() {
  const envUrl = import.meta.env.VITE_API_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  if (import.meta.env.DEV) return "http://localhost:8000";
  // Production on Netlify: /api/* is proxied to Railway in netlify.toml
  return "/api";
}

export const API_URL = resolveApiUrl();

export const isLocalApi =
  API_URL.includes("localhost") ||
  API_URL.includes("127.0.0.1") ||
  API_URL === "/api";

export async function fetchJson(path, options = {}) {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, options);
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
  const res = await fetch(url, { method: "POST", body: form });
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
