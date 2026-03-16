import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: Array<{
    tool_name: string;
    args: string;
    result_preview: string;
  }>;
}

const API = "/api";

export function SandboxPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sandboxStatus, setSandboxStatus] = useState<string>("not_started");
  const [mcpUrl, setMcpUrl] = useState<string>("");
  const [_envVars, setEnvVars] = useState<Record<string, string>>({});
  const [envInput, setEnvInput] = useState("API_TOKEN=\nBASE_URL=");
  const [logs, setLogs] = useState<string>("");
  const [showLogs, setShowLogs] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugResult, setDebugResult] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startSandbox = async () => {
    setLoading(true);
    setSandboxStatus("starting");

    // Parse env vars
    const vars: Record<string, string> = {};
    for (const line of envInput.split("\n")) {
      const [k, ...v] = line.split("=");
      if (k.trim() && v.join("=").trim()) vars[k.trim()] = v.join("=").trim();
    }
    setEnvVars(vars);

    try {
      const resp = await fetch(`${API}/sandbox/${jobId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ env_vars: vars }),
      });
      const data = await resp.json();
      if (data.healthy || data.status === "running") {
        setSandboxStatus("running");
        setMcpUrl(data.mcp_url);
        setMessages([
          {
            role: "system",
            content: `MCP server running at ${data.mcp_url}. Ask me anything!`,
          },
        ]);
      } else {
        setSandboxStatus("error");
        setMessages([
          {
            role: "system",
            content: `Server started but not healthy. Check logs. Detail: ${data.detail || ""}`,
          },
        ]);
      }
    } catch (e) {
      setSandboxStatus("error");
      setMessages([{ role: "system", content: "Failed to start sandbox." }]);
    }
    setLoading(false);
  };

  const sendTest = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    try {
      const resp = await fetch(`${API}/sandbox/${jobId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await resp.json();
      if (data.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.response,
            toolCalls: data.tool_calls,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: `Error: ${data.error || data.detail || "Unknown error"}`,
            toolCalls: data.tool_calls,
          },
        ]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: "Request failed." },
      ]);
    }
    setLoading(false);
  };

  const fetchLogs = async () => {
    const resp = await fetch(`${API}/sandbox/${jobId}/logs`);
    const data = await resp.json();
    setLogs(data.logs);
    setShowLogs(true);
  };

  const runDebug = async (errorDesc: string) => {
    setLoading(true);
    setDebugResult("Analyzing and fixing...");
    try {
      const resp = await fetch(`${API}/sandbox/${jobId}/debug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error_description: errorDesc }),
      });
      const data = await resp.json();
      setDebugResult(
        `Diagnosis: ${data.diagnosis}\n\nChanges: ${data.changes_summary}`,
      );
      if (data.sandbox_restarted) {
        setSandboxStatus("running");
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: `Code fixed and server restarted. ${data.changes_summary}`,
          },
        ]);
      }
    } catch (e) {
      setDebugResult("Debug failed.");
    }
    setLoading(false);
  };

  return (
    <div className="sandbox-page">
      <div className="sandbox-main">
        <h2>MCP Server Sandbox</h2>

        {sandboxStatus === "not_started" && (
          <div className="sandbox-setup">
            <p>Configure environment variables for your MCP server:</p>
            <textarea
              value={envInput}
              onChange={(e) => setEnvInput(e.target.value)}
              placeholder="API_TOKEN=your-token-here&#10;BASE_URL=https://api.example.com"
              rows={5}
            />
            <button
              onClick={startSandbox}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? "Starting..." : "Start MCP Server"}
            </button>
          </div>
        )}

        {sandboxStatus !== "not_started" && (
          <>
            <div className="sandbox-status">
              <span className={`status-dot ${sandboxStatus}`} />
              {sandboxStatus === "running"
                ? "Server running"
                : sandboxStatus === "starting"
                  ? "Starting..."
                  : "Error"}
              {mcpUrl && <code>{mcpUrl}</code>}
              <button onClick={fetchLogs} className="btn-small">
                Logs
              </button>
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="btn-small"
              >
                Debug
              </button>
            </div>

            <div className="sandbox-chat">
              {messages.map((msg, i) => (
                <div key={i} className={`chat-msg ${msg.role}`}>
                  <div className="chat-msg-label">
                    {msg.role === "user"
                      ? "You"
                      : msg.role === "system"
                        ? "System"
                        : "Agent"}
                  </div>
                  <div className="chat-msg-content">{msg.content}</div>
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="tool-calls">
                      {msg.toolCalls.map((tc, j) => (
                        <div key={j} className="tool-call">
                          <span className="tool-name">{tc.tool_name}</span>
                          <span className="tool-args">{tc.args}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="chat-msg assistant">
                  <div className="chat-msg-label">Agent</div>
                  <div className="chat-msg-content typing">Testing...</div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="chat-input-area">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendTest()}
                placeholder="Ask the agent to use MCP tools..."
                disabled={sandboxStatus !== "running"}
              />
              <button
                onClick={sendTest}
                disabled={loading || sandboxStatus !== "running"}
              >
                Test
              </button>
            </div>
          </>
        )}
      </div>

      {(showLogs || showDebug) && (
        <div className="sandbox-sidebar">
          {showLogs && (
            <div className="logs-panel">
              <div className="panel-header">
                <h3>Container Logs</h3>
                <button onClick={() => setShowLogs(false)}>x</button>
              </div>
              <pre>{logs || "No logs yet"}</pre>
              <button onClick={fetchLogs} className="btn-small">
                Refresh
              </button>
            </div>
          )}
          {showDebug && (
            <div className="debug-panel">
              <div className="panel-header">
                <h3>Debug Agent</h3>
                <button onClick={() => setShowDebug(false)}>x</button>
              </div>
              <p>Describe the issue:</p>
              <textarea
                id="debug-input"
                rows={3}
                placeholder="e.g. get_pet tool returns HTML instead of JSON"
              />
              <button
                onClick={() => {
                  const el = document.getElementById(
                    "debug-input",
                  ) as HTMLTextAreaElement;
                  runDebug(el.value);
                }}
                disabled={loading}
                className="btn-primary"
              >
                {loading ? "Fixing..." : "Auto-Fix"}
              </button>
              {debugResult && <pre className="debug-result">{debugResult}</pre>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
