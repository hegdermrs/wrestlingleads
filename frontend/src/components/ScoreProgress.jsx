export default function ScoreProgress({ progress }) {
  if (!progress) return null;

  const percent = Math.max(0, Math.min(100, progress.percent ?? 0));
  const label = progress.phase_label || progress.phase || "Scoring";
  const message =
    progress.progress_message ||
    (progress.total
      ? `${label}: ${progress.processed ?? 0} / ${progress.total}`
      : label);

  return (
    <div className="score-progress" role="status" aria-live="polite">
      <div className="score-progress-header">
        <span className="score-progress-label">{message}</span>
        <span className="score-progress-percent">{percent}%</span>
      </div>
      <div className="score-progress-track">
        <div className="score-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      {progress.phase === "llm" && progress.total > 0 && (
        <p className="score-progress-detail">
          DeepSeek: {progress.processed?.toLocaleString()} of {progress.total?.toLocaleString()} leads scored
        </p>
      )}
    </div>
  );
}
