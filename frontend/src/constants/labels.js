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

export const BUCKET_INFO = {
  urgent: {
    title: "Urgent — Gene",
    color: "rep-urgent",
    hint: "Red-hot leads ready to start (~2 per week)",
  },
  hot_warm: {
    title: "Hot & warm — Jake",
    color: "rep-hot",
    hint: "Strong leads worth fast outreach (~5 per week)",
  },
  general: {
    title: "Everyone else — Beau & Eric",
    color: "rep-general",
    hint: "Shared pool; Eric gets West Coast first",
  },
};

export function leadDisplayName(lead) {
  const name = `${lead["First Name"] || ""} ${lead["Last Name"] || ""}`.trim();
  return name || lead.Email || "Unknown";
}

export function tierLabel(tier) {
  return TIER_LABELS[tier]?.short || tier || "—";
}
