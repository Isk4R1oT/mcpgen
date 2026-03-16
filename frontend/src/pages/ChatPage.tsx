import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface Config {
  auth_strategy?: Record<string, unknown>;
  selected_endpoints?: string[];
  server_name?: string;
}

const API = "/api";

export function ChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [config, setConfig] = useState<Config>({});
  const [phase, setPhase] = useState<string>("init");
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Poll generation status
  useEffect(() => {
    if (!jobId || !generationStatus || generationStatus === "completed" || generationStatus === "failed") return;
    const interval = setInterval(async () => {
      const resp = await fetch(`${API}/jobs/${jobId}/status`);
      const data = await resp.json();
      setGenerationStatus(data.status);
      if (data.status === "completed") {
        setMessages((prev) => [...prev, { role: "system", content: "MCP server generated! You can now test it or download." }]);
        setPhase("done");
      } else if (data.status === "failed") {
        setMessages((prev) => [...prev, { role: "system", content: "Generation failed. Try again with different settings." }]);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobId, generationStatus]);

  const handleUpload = async (file: File) => {
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: `Uploading ${file.name}...` }]);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch(`${API}/configure/start/upload`, { method: "POST", body: form });
      const data = await resp.json();
      setJobId(data.job_id);
      setPhase(data.phase);
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "system", content: "Upload failed." }]);
    }
    setLoading(false);
  };

  const handleUrl = async (url: string) => {
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: `Loading from ${url}` }]);
    try {
      const resp = await fetch(`${API}/configure/start/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await resp.json();
      if (data.job_id) {
        setJobId(data.job_id);
        setPhase(data.phase);
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
      } else {
        setMessages((prev) => [...prev, { role: "system", content: data.detail || "Failed to load URL" }]);
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: "system", content: "Failed to fetch URL." }]);
    }
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");

    // Before job — check if URL or file
    if (!jobId) {
      if (msg.startsWith("http")) {
        await handleUrl(msg);
        return;
      }
      setMessages((prev) => [...prev, { role: "user", content: msg }, { role: "assistant", content: "Paste a Swagger URL or upload an OpenAPI spec file to get started." }]);
      return;
    }

    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    try {
      const resp = await fetch(`${API}/configure/${jobId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await resp.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
      setPhase(data.phase);
      if (data.config) setConfig(data.config);

      if (data.ready_to_generate) {
        setGenerationStatus("parsing");
        setMessages((prev) => [...prev, { role: "system", content: "Generating MCP server... This takes 20-40 seconds." }]);
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: "system", content: "Error sending message." }]);
    }
    setLoading(false);
  };

  return (
    <div className="chat-page">
      <div className="chat-main">
        <div className="chat-messages-area">
          {messages.length === 0 && (
            <div className="chat-empty">
              <h1>mcpgen</h1>
              <p>Generate MCP servers from API documentation</p>
              <div className="chat-starters">
                <p>Paste a Swagger URL, or upload an OpenAPI spec file:</p>
                <label className="upload-btn">
                  Upload .yaml / .json
                  <input type="file" accept=".yaml,.yml,.json" hidden onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                  }} />
                </label>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg ${msg.role}`}>
              <div className="chat-msg-label">{msg.role === "user" ? "You" : msg.role === "system" ? "System" : "mcpgen"}</div>
              <div className="chat-msg-content">{msg.content}</div>
            </div>
          ))}

          {loading && <div className="chat-msg assistant"><div className="chat-msg-label">mcpgen</div><div className="chat-msg-content typing">Thinking...</div></div>}

          {generationStatus && generationStatus !== "completed" && generationStatus !== "failed" && (
            <div className="generation-bar">
              Generating: {generationStatus}...
            </div>
          )}

          {phase === "done" && jobId && (
            <div className="done-actions">
              <button onClick={() => navigate(`/result/${jobId}`)} className="btn-primary">View Result & Download</button>
              <button onClick={() => navigate(`/sandbox/${jobId}`)} className="btn-primary btn-test">Test with AI Agent</button>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="chat-input-area">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder={jobId ? "Describe auth, select endpoints, or say 'generate'..." : "Paste Swagger URL (e.g. https://api.example.com/docs)"}
          />
          <button onClick={sendMessage} disabled={loading}>Send</button>
        </div>
      </div>

      {config.selected_endpoints && config.selected_endpoints.length > 0 && (
        <div className="config-sidebar">
          <h3>Config</h3>
          {config.server_name && <div className="config-item"><strong>Name:</strong> {config.server_name}</div>}
          {config.auth_strategy && <div className="config-item"><strong>Auth:</strong> {(config.auth_strategy as Record<string,string>).type}</div>}
          <div className="config-item"><strong>Endpoints:</strong> {config.selected_endpoints.length}</div>
          <div className="config-endpoints">
            {config.selected_endpoints.map((ep) => (
              <div key={ep} className="config-ep">{ep}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
