import { leadFormEntries } from "../../constants/formFields.js";

export default function LeadFormDetails({ lead }) {
  const entries = leadFormEntries(lead);
  if (!entries.length) {
    return <p className="muted">No form details stored for this lead.</p>;
  }

  return (
    <dl className="lead-form-details">
      {entries.map(({ label, value }) => (
        <div key={label} className="lead-form-row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
