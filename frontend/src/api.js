export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const isLocalApi = API_URL.includes("localhost") || API_URL.includes("127.0.0.1");

export async function fetchJson(path, options = {}) {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, options);
  const text = await res.text();

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const hint = isLocalApi
        ? "VITE_API_URL is still localhost. On Netlify, set it to your Railway URL and redeploy."
        : "Check that your Railway backend is running and VITE_API_URL matches its public URL.";
      throw new Error(`Cannot reach API at ${API_URL}. ${hint}`);
    }
  }

  if (!res.ok) {
    const detail = data?.detail;
    const err = new Error(
      typeof detail === "string" ? detail : `Request failed (${res.status})`
    );
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
