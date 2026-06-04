import { Fragment, useState } from "react";
import Badge from "../ui/Badge.jsx";
import LeadFormDetails from "./LeadFormDetails.jsx";
import { leadHasFormDetails } from "../../constants/formFields.js";
import { leadDisplayName } from "../../constants/labels.js";

function cell(value) {
  const text = value == null || value === "" ? "—" : String(value);
  return text;
}

export default function LeadsTable({ leads }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="leads-table-wrap">
      <table className="leads-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th className="num">Fit</th>
            <th>Priority</th>
            <th>Assigned</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, i) => {
            const key = lead["Record ID"] || lead.Email || i;
            const open = expanded === key;
            const hasDetail = leadHasFormDetails(lead) || lead["AI Reasons"];

            return (
              <Fragment key={key}>
                <tr
                  className={`leads-row ${i % 2 ? "alt" : ""} ${open ? "open" : ""} ${hasDetail ? "expandable" : ""}`}
                  onClick={() => hasDetail && setExpanded(open ? null : key)}
                >
                  <td className="name-cell">{leadDisplayName(lead)}</td>
                  <td className="email-cell">{cell(lead.Email)}</td>
                  <td>{cell(lead["Phone Number"])}</td>
                  <td className="num score-cell">{cell(lead["AI Score"])}</td>
                  <td>
                    <Badge tier={lead["AI Tier"]} showEmoji={false} />
                  </td>
                  <td>{cell(lead["Assigned Rep"])}</td>
                  <td className="date-cell">{cell(lead["Create Date"])}</td>
                </tr>
                {open && (
                  <tr className="leads-detail-row">
                    <td colSpan={7}>
                      <p className="detail-section-title">Form submission</p>
                      <LeadFormDetails lead={lead} />
                      {lead["AI Reasons"] && (
                        <p className="lead-ai-reason">
                          <span className="detail-label">Why this priority:</span> {lead["AI Reasons"]}
                        </p>
                      )}
                      {lead["Recommended Action"] && (
                        <p className="lead-ai-reason">
                          <span className="detail-label">Suggested next step:</span>{" "}
                          {lead["Recommended Action"]}
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="table-hint">Click a row to see the full form answers</p>
    </div>
  );
}
