import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getDockerInfo, getCodePreview, downloadSource } from "../api/client";

export function ResultPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [dockerInfo, setDockerInfo] = useState<{ pull_command: string; run_command: string; build_from_source: string } | null>(null);
  const [code, setCode] = useState<Array<{ filename: string; content: string }>>([]);
  const [activeTab, setActiveTab] = useState<"docker" | "code">("docker");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    getDockerInfo(jobId).then(setDockerInfo);
    getCodePreview(jobId).then((r) => setCode(r.files));
  }, [jobId]);

  const handleDownload = async () => {
    if (!jobId) return;
    const blob = await downloadSource(jobId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mcp-server.tar.gz";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="result-page">
      <h1>MCP Server Ready!</h1>

      <div className="result-tabs">
        <button className={activeTab === "docker" ? "active" : ""} onClick={() => setActiveTab("docker")}>
          Docker
        </button>
        <button className={activeTab === "code" ? "active" : ""} onClick={() => setActiveTab("code")}>
          Code Preview
        </button>
      </div>

      {activeTab === "docker" && dockerInfo && (
        <div className="result-docker">
          <div className="result-card">
            <h3>Build from Source</h3>
            <pre>
              <code>{dockerInfo.build_from_source}</code>
            </pre>
            <button onClick={() => copyToClipboard(dockerInfo.build_from_source)}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div className="result-card">
            <h3>Run</h3>
            <pre>
              <code>{dockerInfo.run_command}</code>
            </pre>
          </div>

          <button onClick={handleDownload} className="btn-primary">
            Download Source (.tar.gz)
          </button>
        </div>
      )}

      {activeTab === "code" && (
        <div className="result-code">
          {code.map((file) => (
            <div key={file.filename} className="code-file">
              <h3>{file.filename}</h3>
              <pre><code>{file.content}</code></pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
