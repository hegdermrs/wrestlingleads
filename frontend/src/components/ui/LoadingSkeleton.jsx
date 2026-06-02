export default function LoadingSkeleton({ rows = 3 }) {
  return (
    <div className="skeleton-stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}
