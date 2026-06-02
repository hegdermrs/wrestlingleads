export default function Toast({ type = "success", message }) {
  if (!message) return null;
  return (
    <div className={`toast toast-${type} animate-toast`} role="status">
      {type === "success" ? "✓" : "!"}
      <span>{message}</span>
    </div>
  );
}
