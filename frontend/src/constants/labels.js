/** Client-friendly labels (non-technical). */

export const TIER_LABELS = {
  Hot: { short: "Priority", hint: "Call first — strong fit & ready", emoji: "🔥" },
  Warm: { short: "Good fit", hint: "Worth a follow-up", emoji: "☀️" },
  Cold: { short: "Low priority", hint: "Nurture when you have time", emoji: "❄️" },
  Unqualified: { short: "Not a fit", hint: "Deprioritize", emoji: "—" },
};

export const TIER_CLASS = {
  Hot: "tier-hot",
  Warm: "tier-warm",
  Cold: "tier-cold",
  Unqualified: "tier-unqualified",
};

/** Card accent colors only (no boilerplate copy on Team cards). */
export const BUCKET_INFO = {
  urgent: { title: "Gene", color: "rep-urgent", hint: "" },
  hot_warm: { title: "Jake", color: "rep-hot", hint: "" },
  general: { title: "Beau & Eric", color: "rep-general", hint: "" },
  automation: { title: "Automation", color: "rep-general", hint: "" },
};

export function leadDisplayName(lead) {
  const name = `${lead["First Name"] || ""} ${lead["Last Name"] || ""}`.trim();
  return name || lead.Email || "Unknown";
}

export function tierLabel(tier) {
  return TIER_LABELS[tier]?.short || tier || "—";
}
