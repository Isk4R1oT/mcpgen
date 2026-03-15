import { useNavigate } from "react-router-dom";

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      <h1>mcpgen</h1>
      <p className="subtitle">Generate MCP servers from API documentation</p>

      <div className="features">
        <div className="feature">
          <strong>1. Upload</strong>
          <p>OpenAPI/Swagger spec (YAML or JSON)</p>
        </div>
        <div className="feature">
          <strong>2. Configure</strong>
          <p>Select endpoints, set up auth</p>
        </div>
        <div className="feature">
          <strong>3. Generate</strong>
          <p>AI creates a production-ready MCP server</p>
        </div>
        <div className="feature">
          <strong>4. Deploy</strong>
          <p>Download Docker image and run</p>
        </div>
      </div>

      <button onClick={() => navigate("/wizard")} className="btn-primary btn-large">
        Generate MCP Server
      </button>
    </div>
  );
}
