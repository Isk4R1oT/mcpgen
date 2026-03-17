"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatMessage, type ToolCall } from "@/components/chat/chat-message";
import {
  Play,
  Send,
  PanelRightOpen,
  PanelRightClose,
  ScrollText,
  Bug,
  Loader2,
  Wrench,
  CircleCheck,
  CircleX,
  RefreshCw,
} from "lucide-react";

type ChatMsg = {
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: ToolCall[];
  success?: boolean;
};

type SandboxStatus = {
  mcp_url: string;
  healthy: boolean;
  status: string;
};

export default function SandboxPage() {
  const params = useParams();
  const jobId = params.jobId as string;

  const [envVarsText, setEnvVarsText] = useState("");
  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus | null>(
    null
  );
  const [isStarting, setIsStarting] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<"logs" | "debug">("logs");
  const [logs, setLogs] = useState("");
  const [debugInput, setDebugInput] = useState("");
  const [debugResult, setDebugResult] = useState<{
    diagnosis: string;
    changes_summary: string;
  } | null>(null);
  const [isDebugging, setIsDebugging] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleStartSandbox = async () => {
    setIsStarting(true);
    try {
      const envVars: Record<string, string> = {};
      envVarsText
        .split("\n")
        .filter((line) => line.trim() && line.includes("="))
        .forEach((line) => {
          const eqIndex = line.indexOf("=");
          const key = line.slice(0, eqIndex).trim();
          const value = line.slice(eqIndex + 1).trim();
          envVars[key] = value;
        });

      const res = await fetch(`/api/sandbox/${jobId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ env_vars: envVars }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Failed to start sandbox");
      }

      setSandboxStatus(data);
      setMessages([
        {
          role: "system",
          content: data.healthy
            ? `Sandbox started. MCP server is healthy at ${data.mcp_url}`
            : `Sandbox started but server is not healthy. Status: ${data.status}`,
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setMessages([
        { role: "system", content: `Failed to start sandbox: ${message}` },
      ]);
    } finally {
      setIsStarting(false);
    }
  };

  const handleSendTest = async () => {
    if (!chatInput.trim()) return;
    const userMessage = chatInput.trim();
    setChatInput("");
    setIsSending(true);
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    try {
      const res = await fetch(`/api/sandbox/${jobId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Test failed");
      }

      const toolCalls: ToolCall[] = (data.tool_calls ?? []).map(
        (tc: { name: string; args: Record<string, unknown> }) => ({
          name: tc.name,
          args: tc.args,
        })
      );

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          toolCalls,
          success: data.success,
        },
      ]);

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "system", content: `Error: ${data.error}` },
        ]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Error: ${message}` },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleFetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch(`/api/sandbox/${jobId}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? "No logs available");
      }
    } catch {
      setLogs("Failed to fetch logs");
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleDebug = async () => {
    if (!debugInput.trim()) return;
    setIsDebugging(true);
    setDebugResult(null);

    try {
      const res = await fetch(`/api/sandbox/${jobId}/debug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error_description: debugInput }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Debug failed");
      }

      setDebugResult({
        diagnosis: data.diagnosis,
        changes_summary: data.changes_summary,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setDebugResult({
        diagnosis: `Error: ${message}`,
        changes_summary: "",
      });
    } finally {
      setIsDebugging(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendTest();
    }
  };

  // Not started yet -- show setup screen
  if (!sandboxStatus) {
    return (
      <div className="dark flex min-h-screen flex-col bg-background text-foreground">
        <div className="border-b border-border px-6 py-4">
          <h1 className="text-lg font-semibold">MCP Testing Sandbox</h1>
          <p className="text-xs text-muted-foreground">Job: {jobId}</p>
        </div>

        <div className="flex flex-1 items-center justify-center p-6">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Start Sandbox</CardTitle>
              <CardDescription>
                Configure environment variables and start the MCP server sandbox
                for testing.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Environment Variables
                </label>
                <Textarea
                  placeholder={`API_KEY=your-key-here\nBASE_URL=https://api.example.com\nDEBUG=true`}
                  value={envVarsText}
                  onChange={(e) => setEnvVarsText(e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  One variable per line, KEY=VALUE format
                </p>
              </div>
              <Button
                onClick={handleStartSandbox}
                disabled={isStarting}
                className="w-full"
              >
                {isStarting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Start Sandbox
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="dark flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">MCP Sandbox</h1>
          <Badge
            variant={sandboxStatus.healthy ? "default" : "destructive"}
            className="gap-1"
          >
            {sandboxStatus.healthy ? (
              <CircleCheck className="size-3" />
            ) : (
              <CircleX className="size-3" />
            )}
            {sandboxStatus.healthy ? "Healthy" : "Unhealthy"}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowRightPanel((v) => !v)}
        >
          {showRightPanel ? (
            <PanelRightClose className="size-4" />
          ) : (
            <PanelRightOpen className="size-4" />
          )}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat Panel */}
        <div className="flex flex-1 flex-col">
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-1 py-4">
              {messages.map((msg, idx) => (
                <div key={idx}>
                  <ChatMessage
                    role={msg.role}
                    content={msg.content}
                    toolCalls={msg.toolCalls}
                  />
                  {msg.role === "assistant" && msg.success !== undefined && (
                    <div className="flex px-4 pb-2">
                      <Badge
                        variant={msg.success ? "default" : "destructive"}
                        className="ml-11 gap-1 text-[10px]"
                      >
                        {msg.success ? (
                          <CircleCheck className="size-2.5" />
                        ) : (
                          <CircleX className="size-2.5" />
                        )}
                        {msg.success ? "Success" : "Failed"}
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
              {isSending && (
                <div className="flex gap-3 px-4 py-3">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                  </div>
                  <div className="rounded-xl bg-card px-4 py-2.5 text-sm text-muted-foreground ring-1 ring-foreground/10">
                    Testing...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Chat Input */}
          <div className="border-t border-border px-6 py-4">
            <div className="flex gap-2">
              <Textarea
                placeholder="Send a test message to the MCP server... (Enter to send)"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                className="min-h-10 resize-none"
                rows={1}
              />
              <Button
                onClick={handleSendTest}
                disabled={!chatInput.trim() || isSending}
                size="icon"
              >
                {isSending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        {showRightPanel && (
          <div className="flex w-96 flex-col border-l border-border">
            {/* Panel Tabs */}
            <div className="flex border-b border-border">
              <button
                onClick={() => setRightPanelTab("logs")}
                className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  rightPanelTab === "logs"
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ScrollText className="size-3.5" />
                Logs
              </button>
              <button
                onClick={() => setRightPanelTab("debug")}
                className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  rightPanelTab === "debug"
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Bug className="size-3.5" />
                Debug
              </button>
            </div>

            {/* Logs Tab */}
            {rightPanelTab === "logs" && (
              <div className="flex flex-1 flex-col">
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Server Logs
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleFetchLogs}
                    disabled={isLoadingLogs}
                  >
                    {isLoadingLogs ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" />
                    )}
                  </Button>
                </div>
                <Separator />
                <ScrollArea className="flex-1">
                  {logs ? (
                    <pre className="p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                      {logs}
                    </pre>
                  ) : (
                    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                      Click refresh to load logs
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}

            {/* Debug Tab */}
            {rightPanelTab === "debug" && (
              <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Error Description
                  </label>
                  <Textarea
                    placeholder="Describe the error or issue you're seeing..."
                    value={debugInput}
                    onChange={(e) => setDebugInput(e.target.value)}
                    rows={4}
                    className="text-xs"
                  />
                </div>
                <Button
                  onClick={handleDebug}
                  disabled={!debugInput.trim() || isDebugging}
                  className="w-full"
                >
                  {isDebugging ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Wrench className="size-4" />
                  )}
                  Auto-Fix
                </Button>

                {debugResult && (
                  <div className="flex flex-col gap-3">
                    <Card size="sm">
                      <CardHeader>
                        <CardTitle className="text-xs">Diagnosis</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {debugResult.diagnosis}
                        </p>
                      </CardContent>
                    </Card>
                    {debugResult.changes_summary && (
                      <Card size="sm">
                        <CardHeader>
                          <CardTitle className="text-xs">
                            Changes Applied
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {debugResult.changes_summary}
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
