interface Props {
  serverName: string;
  onServerNameChange: (name: string) => void;
  selectedCount: number;
  authType: string;
  onGenerate: () => void;
  loading: boolean;
}

export function StepReview({ serverName, onServerNameChange, selectedCount, authType, onGenerate, loading }: Props) {
  return (
    <div className="step">
      <h2>Step 4: Review & Generate</h2>

      <label>
        Server Name
        <input
          type="text"
          value={serverName}
          onChange={(e) => onServerNameChange(e.target.value)}
          placeholder="e.g. petstore-mcp"
        />
      </label>

      <div className="review-summary">
        <div className="review-item">
          <strong>Endpoints:</strong> {selectedCount} selected
        </div>
        <div className="review-item">
          <strong>Auth:</strong> {authType === "none" ? "None" : authType}
        </div>
        <div className="review-item">
          <strong>Transport:</strong> Streamable HTTP (port 8000)
        </div>
      </div>

      <button onClick={onGenerate} disabled={loading || !serverName} className="btn-primary btn-generate">
        {loading ? "Generating..." : "Generate MCP Server"}
      </button>
    </div>
  );
}
