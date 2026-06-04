/** Lead-split & priority fields on each rep card (Team page). */

export const REP_SCORING_FIELDS = {
  urgent: [
    {
      rulesKey: "distribution_gene_pct",
      label: "Share of all new leads",
      suffix: "%",
      min: 0,
      max: 100,
      step: 1,
    },
    {
      rubricKey: "Hot",
      label: "Inbox shows Priority when fit is at least",
      prefix: "≥",
      min: 0,
      max: 100,
    },
    {
      rulesKey: "urgent_min_score",
      label: "Goes to Gene first when Priority, ready soon, fit at least",
      prefix: "≥",
      min: 0,
      max: 100,
    },
    {
      scoringKey: "coaching_score_boost",
      label: "Extra points for a full coaching form",
      prefix: "+",
      min: 0,
      max: 20,
    },
    {
      scoringKey: "icp_llm_min",
      label: "Strong match to ideal customer (keeps them Priority)",
      prefix: "≥",
      min: 40,
      max: 95,
    },
  ],
  hot_warm: [
    {
      rulesKey: "distribution_jake_pct",
      label: "Share of all new leads",
      suffix: "%",
      min: 0,
      max: 100,
    },
    {
      rubricKey: "Warm",
      label: "Inbox shows Good fit when fit is at least",
      prefix: "≥",
      min: 0,
      max: 100,
    },
  ],
  general: [
    {
      rulesKey: "distribution_general_pct",
      label: "Share for Beau & Eric together",
      suffix: "%",
      min: 0,
      max: 100,
      editOnRepId: "beau",
    },
    {
      rubricKey: "Cold",
      label: "Inbox shows Low priority when fit is at least",
      prefix: "≥",
      min: 0,
      max: 100,
      editOnRepId: "beau",
    },
  ],
  automation: [
    {
      rulesKey: "distribution_automation_pct",
      label: "Share that stays in automation (no rep email)",
      suffix: "%",
      min: 0,
      max: 100,
    },
  ],
};
