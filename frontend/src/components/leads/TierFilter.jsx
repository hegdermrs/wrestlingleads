import { TIER_LABELS } from "../../constants/labels.js";

const FILTERS = [
  { key: "All", label: "All leads", className: "" },
  { key: "Hot", label: TIER_LABELS.Hot.short, className: "tier-hot" },
  { key: "Warm", label: TIER_LABELS.Warm.short, className: "tier-warm" },
  { key: "Cold", label: TIER_LABELS.Cold.short, className: "tier-cold" },
  { key: "Unqualified", label: TIER_LABELS.Unqualified.short, className: "tier-unqualified" },
];

export default function TierFilter({ active, counts, onChange, total, avgScore }) {
  return (
    <div className="tier-filter">
      {FILTERS.map((f) => {
        const count = f.key === "All" ? total : counts[f.key] ?? 0;
        const isActive = active === f.key;
        return (
          <button
            key={f.key}
            type="button"
            className={`tier-pill ${f.className} ${isActive ? "active" : ""}`}
            onClick={() => onChange(f.key)}
          >
            <span className="tier-pill-label">{f.label}</span>
            <span className="tier-pill-count">{count}</span>
            {f.key === "All" && avgScore != null && (
              <span className="tier-pill-sub">avg {avgScore}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
