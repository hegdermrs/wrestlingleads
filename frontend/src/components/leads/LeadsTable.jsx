import { Fragment, useState } from "react";
import Badge from "../ui/Badge.jsx";
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
            <th className="num">Score</th>
            <th>Tier</th>
            <th>Rep</th>
            <th>Action</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, i) => {
            const key = lead["Record ID"] || lead.Email || i;
            const open = expanded === key;
            return (
              <Fragment key={key}>
                <tr
                  className={`leads-row ${i % 2 ? "alt" : ""} ${open ? "open" : ""}`}
                  onClick={() => setExpanded(open ? null : key)}
                >
                  <td className="name-cell">{leadDisplayName(lead)}</td>
                  <td className="email-cell">{cell(lead.Email)}</td>
                  <td>{cell(lead["Phone Number"])}</td>
                  <td className="num score-cell">{cell(lead["AI Score"])}</td>
                  <td>
                    <Badge tier={lead["AI Tier"]} showEmoji={false} />
                  </td>
                  <td>{cell(lead["Assigned Rep"])}</td>
                  <td className="action-cell" title={cell(lead["Recommended Action"])}>
                    {cell(lead["Recommended Action"])}
                  </td>
                  <td className="date-cell">{cell(lead["Create Date"])}</td>
                </tr>
                {open && lead["AI Reasons"] && (
                  <tr className="leads-detail-row">
                    <td colSpan={8}>
                      <span className="detail-label">Why this score:</span> {lead["AI Reasons"]}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="table-hint">Click a row for scoring details</p>
    </div>
  );
}
