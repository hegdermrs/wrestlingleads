import { TIER_CLASS, tierLabel } from "../../constants/labels.js";

export default function Badge({ tier, showEmoji = true }) {
  if (!tier) return null;
  const info = tierLabel(tier);
  const cls = TIER_CLASS[tier] || "";
  return (
    <span className={`badge ${cls}`}>
      {showEmoji && tier === "Hot" && "🔥 "}
      {showEmoji && tier === "Warm" && "☀️ "}
      {info}
    </span>
  );
}
