export default function EmptyState({ icon = "📭", title, message, action }) {
  return (
    <div className="empty-state animate-fade-in">
      <span className="empty-icon" aria-hidden>{icon}</span>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}
