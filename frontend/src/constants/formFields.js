import { leadDisplayName } from "./labels.js";

/** Labels match the Wufoo coaching intake form. */
export const WUFOO_FORM_FIELDS = [
  { key: "Email", label: "Email" },
  { key: "Job Title", label: "Which best describes you" },
  { key: "Phone Number", label: "Cell Phone Number (Parent)" },
  { key: "State/Region", label: "State" },
  { key: "Wrestler's Grade", label: "Wrestler's Grade" },
  { key: "Years experience", label: "Years of Experience" },
  { key: "Wrestler's Goal", label: "Wrestler's Goal" },
  { key: "Deadline for Goal", label: "Is there a deadline for this goal?" },
  { key: "Job function", label: "Reason for Inquiry" },
  { key: "Relationship Status", label: "How willing is your wrestler to start mindset training?" },
  { key: "Source", label: "Where did you hear about Wrestling Mindset?" },
  { key: "Investment Level", label: "Preferred investment level" },
  { key: "Club/Team Promo Code", label: "Club/Team Promo Code" },
  { key: "Message", label: "Additional wrestling information" },
  { key: "UTM Source", label: "UTM Source" },
  { key: "UTM Medium", label: "UTM Medium" },
  { key: "UTM Campaign", label: "UTM Campaign" },
  { key: "UTM Term", label: "UTM Term" },
  { key: "UTM Content", label: "UTM Content" },
  { key: "UTM Keyword", label: "UTM Keyword" },
];

export function leadFormEntries(lead) {
  const entries = [];
  const name = leadDisplayName(lead);
  if (name && name !== "Unknown") {
    entries.push({ label: "Name", value: name });
  }
  for (const { key, label } of WUFOO_FORM_FIELDS) {
    const raw = lead[key];
    if (raw == null || String(raw).trim() === "") continue;
    entries.push({ label, value: String(raw).trim() });
  }
  return entries;
}

export function leadHasFormDetails(lead) {
  return leadFormEntries(lead).length > 0;
}
