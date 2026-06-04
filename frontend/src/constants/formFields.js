import { leadDisplayName } from "./labels.js";

/** Labels match the Wufoo coaching intake form. */
export const WUFOO_FORM_FIELDS = [
  { key: "Email", label: "Email" },
  { key: "Job Title", label: "Which best describes you" },
  { key: "Phone Number", label: "Cell phone number" },
  { key: "State/Region", label: "State" },
  { key: "Wrestler's Grade", label: "Wrestler's grade" },
  { key: "Years experience", label: "Years of experience" },
  { key: "Wrestler's Goal", label: "Wrestler's goal" },
  { key: "Deadline for Goal", label: "Deadline for this goal" },
  { key: "Job function", label: "Reason for inquiry" },
  { key: "Relationship Status", label: "How willing to start mindset training" },
  { key: "Source", label: "Where did you hear about Wrestling Mindset" },
  { key: "Investment Level", label: "Preferred investment level" },
  { key: "Message", label: "Additional wrestling information" },
  { key: "UTM Source", label: "UTM source" },
  { key: "UTM Medium", label: "UTM medium" },
  { key: "UTM Campaign", label: "UTM campaign" },
  { key: "UTM Term", label: "UTM term" },
  { key: "UTM Content", label: "UTM content" },
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
