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
    title: "Top priority — Gene",
    color: "rep-urgent",
    hint: "Parents ready to start soon — your hottest opportunities",
  },
  hot_warm: {
    title: "Strong leads — Jake",
    color: "rep-hot",
    hint: "Worth a quick call — not quite emergency level",
  },
  general: {
    title: "General pool — Beau & Eric",
    color: "rep-general",
    hint: "Everyone else; Eric gets West Coast states first when enabled",
  },
  automation: {
    title: "Automation only",
    color: "rep-general",
    hint: "Lower-fit leads — workflows only, no rep notification",
  },
};

export function leadDisplayName(lead) {
  const name = `${lead["First Name"] || ""} ${lead["Last Name"] || ""}`.trim();
  return name || lead.Email || "Unknown";
}

export function tierLabel(tier) {
  return TIER_LABELS[tier]?.short || tier || "—";
}
