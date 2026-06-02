export default function Card({ children, className = "", delay = 0, title, subtitle, actions }) {
  return (
    <section
      className={`card animate-slide-up ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {(title || actions) && (
        <div className="card-header">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
