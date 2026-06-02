export default function ScoreProgress({ progress }) {
  if (!progress) return null;

  const percent = Math.max(0, Math.min(100, progress.percent ?? 0));
  const message = progress.progress_message || "Working on your leads…";

  return (
    <div className="score-progress animate-fade-in" role="status" aria-live="polite">
      <div className="score-progress-header">
        <span>{message}</span>
        <span className="score-progress-percent">{percent}%</span>
      </div>
      <div className="score-progress-track">
        <div className="score-progress-fill shimmer" style={{ width: `${percent}%` }} />
      </div>
      {progress.status === "complete" && (
        <p className="field-hint success-text">All done — check your Lead inbox.</p>
      )}
    </div>
  );
}
