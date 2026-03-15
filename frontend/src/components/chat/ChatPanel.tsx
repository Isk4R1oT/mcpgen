import { useState } from "react";
import { sendChatMessage } from "../../api/client";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  jobId: string;
  onConfigUpdate?: (updates: Record<string, unknown>) => void;
  onEndpointSuggestion?: (endpoints: string[]) => void;
}

export function ChatPanel({ jobId, onConfigUpdate, onEndpointSuggestion }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const response = await sendChatMessage(jobId, userMsg);
      setMessages((prev) => [...prev, { role: "assistant", content: response.message }]);

      if (response.config_updates && onConfigUpdate) {
        onConfigUpdate(response.config_updates);
      }
      if (response.endpoint_suggestions && onEndpointSuggestion) {
        onEndpointSuggestion(response.endpoint_suggestions);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button className="chat-toggle" onClick={() => setOpen(true)}>
        AI Assistant
      </button>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>AI Assistant</span>
        <button onClick={() => setOpen(false)}>x</button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-hint">Ask me about the API endpoints, auth setup, or which tools to include.</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {loading && <div className="chat-message assistant">Thinking...</div>}
      </div>

      <div className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about the API..."
        />
        <button onClick={send} disabled={loading}>Send</button>
      </div>
    </div>
  );
}
