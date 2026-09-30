export default function RecommendationPanel({ recommendation, loading, onRequest, batchCode }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>AI recommendation</h2>
        <button
          onClick={onRequest}
          disabled={!batchCode || loading}
          className="border border-line-strong text-molten text-xs rounded-sm px-3 py-1 disabled:opacity-50 hover:border-molten transition-colors"
        >
          {loading ? "Thinking…" : "Explain latest risk"}
        </button>
      </div>
      <div className="panel-body">
        {!recommendation && !loading && (
          <p className="text-sm text-low">
            Ask Gemini to explain why the current batch is at risk and what to change.
          </p>
        )}
        {recommendation && (
          <div className="flex flex-col gap-3.5">
            {recommendation.root_cause && (
              <span className="pill warn w-fit">{recommendation.root_cause}</span>
            )}
            <p className="text-sm leading-relaxed text-hi">{recommendation.explanation}</p>
            <div className="flex flex-col gap-2">
              {recommendation.recommended_actions.map((action, i) => (
                <div key={i} className="border-l-2 border-molten pl-3 flex flex-col gap-0.5">
                  <p className="font-mono text-sm text-molten">{action.parameter}</p>
                  <p className="text-sm text-hi">{action.change}</p>
                  <p className="text-xs text-mid">{action.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
