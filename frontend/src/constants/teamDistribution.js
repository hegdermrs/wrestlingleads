/** Unified Team page tables — same layout for every row. */

export const LEAD_SHARE_ROWS = [
  { rulesKey: "distribution_gene_pct", who: "Gene", note: "Top band" },
  { rulesKey: "distribution_jake_pct", who: "Jake", note: "Next band" },
  { rulesKey: "distribution_general_pct", who: "Beau & Eric", note: "Shared middle band" },
  { rulesKey: "distribution_automation_pct", who: "Automation", note: "No rep email" },
];

export const INBOX_RULE_ROWS = [
  {
    id: "priority",
    label: "Priority in inbox",
    hint: "Fit score at or above",
    rubricKey: "Hot",
    min: 0,
    max: 100,
  },
  {
    id: "good-fit",
    label: "Good fit in inbox",
    hint: "Fit score at or above",
    rubricKey: "Warm",
    min: 0,
    max: 100,
  },
  {
    id: "low-priority",
    label: "Low priority in inbox",
    hint: "Fit score at or above",
    rubricKey: "Cold",
    min: 0,
    max: 100,
  },
  {
    id: "gene-first",
    label: "Gene goes first",
    hint: "Priority + ready soon + fit at or above",
    rulesKey: "urgent_min_score",
    min: 0,
    max: 100,
  },
  {
    id: "jake-warm-min",
    label: "Jake warm-lead bar",
    hint: "Warm leads need at least this score for Jake (Hot always qualifies)",
    rulesKey: "jake_min_warm_score",
    min: 0,
    max: 100,
  },
  {
    id: "jake-streak",
    label: "Max Jake in a row",
    hint: "Then spill to Beau/Eric — set 0 to turn off",
    rulesKey: "jake_max_consecutive",
    prefix: "",
    min: 0,
    max: 10,
  },
  {
    id: "coaching-boost",
    label: "Full coaching form bonus",
    hint: "Points added to fit score",
    scoringKey: "coaching_score_boost",
    prefix: "+",
    min: 0,
    max: 20,
  },
  {
    id: "icp-floor",
    label: "Strong ideal-customer match",
    hint: "Keeps Priority when message matches ICP",
    scoringKey: "icp_llm_min",
    min: 40,
    max: 95,
  },
];

export function leadShareTotal(rules) {
  if (!rules) return 0;
  return LEAD_SHARE_ROWS.reduce((sum, row) => sum + Number(rules[row.rulesKey] || 0), 0);
}
