# Hot List Changes — Client Brief

## Why the Hot list looks different

We re-scored all leads with an updated model. The Hot list **names changed** — that does not automatically mean accuracy got worse.

### What we fixed on purpose

**Before:** Subscribers with almost no form data (email-only book/content list) could score ~85–90 **Hot** because the system treated “on the email list” like “wants 1-on-1 coaching.”

**After:** Only leads with **coaching form data** (message, goals, investment level, Wufoo fields, etc.) can reach Hot. Email-only Subscribers are capped at **Cold (~35)**.

That removed false Hot leads — not real coaching prospects.

### Why names still change even for good leads

- **Full re-score** — DeepSeek text scores are re-run; a lead can move Hot ↔ Warm by a few points.
- **ML model retrained** — slightly different probabilities across the file.
- **Customers excluded from dashboard** — ~249 Customers are training data only; they no longer appear in tier counts you see on the dashboard.

### What stayed the same

On our comparison of the previous export vs the new score, **most Hot leads stayed Hot** (~154 stable). Only a small set dropped (often due to normal re-score variance, not the Subscriber fix).

---

## How to review together (15 minutes)

1. Open **`hot_tier_comparison.xlsx`** → sheet **Client Review Template**
2. Mark **5–10 Hot leads you trust** in column `Client Trusts Hot? (Y/N)`
3. Mark **5–10 Hot leads you think are wrong** in column `Client Wrong Hot? (Y/N)`
4. Add notes in `Client Notes` for any row you care about
5. Send the file back — we calibrate from **your examples**, not memory of the old export

---

## What we are not doing

- We are **not** putting email-only book Subscribers back on Hot
- We are **not** rolling back to the old export wholesale
- We **will** adjust rules if you show us real coaching leads that were wrongly demoted

---

## Sheets in the comparison report

| Sheet | Purpose |
|-------|---------|
| **Client Review Template** | Top rows to mark trust / wrong / notes |
| **Still Hot** | Stable Hot — should look familiar |
| **Dropped from Hot** | Was Hot before, not now — review these |
| **New Hot** | Was not Hot before, is now |
| **Investigate Demotions** | Had coaching data but lost Hot — priority review |
| **Intentional Subscriber Caps** | Book/content Subscribers — expected Cold |
| **Summary** | Counts |
