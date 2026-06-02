import { useState } from "react";

export default function Accordion({ title, subtitle, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`accordion ${open ? "open" : ""}`}>
      <button type="button" className="accordion-trigger" onClick={() => setOpen(!open)}>
        <div>
          <span className="accordion-title">{title}</span>
          {subtitle && <span className="accordion-sub">{subtitle}</span>}
        </div>
        <span className={`accordion-chevron ${open ? "rotated" : ""}`}>›</span>
      </button>
      <div className="accordion-body">{open && children}</div>
    </div>
  );
}
