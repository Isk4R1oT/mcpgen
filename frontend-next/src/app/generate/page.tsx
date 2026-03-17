"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ChatMessage, type ToolCall } from "@/components/chat/chat-message";
import {
  Link,
  Upload,
  Send,
  Server,
  Shield,
  Hash,
  Loader2,
} from "lucide-react";

type ChatMsg = {
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: ToolCall[];
};

type ConfigState = {
  endpointsCount: number;
  authType: string;
  serverName: string;
  phase: string;
};

export default function GeneratePage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [config, setConfig] = useState<ConfigState>({
    endpointsCount: 0,
    authType: "None",
    serverName: "",
    phase: "idle",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleStartWithUrl = async () => {
    if (!urlInput.trim()) return;
    setIsLoading(true);
    setIsStarted(true);
    setMessages([
      { role: "user", content: `Analyze API from: ${urlInput}` },
    ]);

    try {
      const res = await fetch("/api/configure/start/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Failed to start configuration");
      }

      setJobId(data.job_id);
      setConfig((prev) => ({
        ...prev,
        endpointsCount: data.endpoints_count ?? prev.endpointsCount,
        phase: data.phase ?? prev.phase,
      }));
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Error: ${message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartWithFile = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    setIsStarted(true);
    setMessages([
      { role: "user", content: `Upload file: ${file.name}` },
    ]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/configure/start/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Failed to start configuration");
      }

      setJobId(data.job_id);
      setConfig((prev) => ({
        ...prev,
        endpointsCount: data.endpoints_count ?? prev.endpointsCount,
        phase: data.phase ?? prev.phase,
      }));
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Error: ${message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !jobId) return;
    const userMessage = inputValue.trim();
    setInputValue("");
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    try {
      const res = await fetch(`/api/configure/${jobId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Failed to send message");
      }

      setConfig((prev) => ({
        ...prev,
        phase: data.phase ?? prev.phase,
        endpointsCount:
          data.config?.endpoints_count ?? prev.endpointsCount,
        authType: data.config?.auth_type ?? prev.authType,
        serverName: data.config?.server_name ?? prev.serverName,
      }));

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message },
      ]);

      if (data.ready_to_generate) {
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: "Configuration complete. Starting generation...",
          },
        ]);
        setTimeout(() => {
          router.push(`/generate/${data.job_id}`);
        }, 1500);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Error: ${message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="dark flex h-screen bg-background text-foreground">
      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">MCP Server Generator</h1>
            <p className="text-sm text-muted-foreground">
              Configure your MCP server through conversation
            </p>
          </div>
          {config.phase !== "idle" && (
            <Badge variant="outline" className="capitalize">
              {config.phase}
            </Badge>
          )}
        </div>

        {/* Messages or Start Screen */}
        <div className="flex-1 overflow-hidden">
          {!isStarted ? (
            <div className="flex h-full flex-col items-center justify-center gap-8 px-4">
              <div className="text-center">
                <h2 className="text-2xl font-bold">
                  Generate an MCP Server
                </h2>
                <p className="mt-2 text-muted-foreground">
                  Paste an API documentation URL or upload a spec file to get
                  started.
                </p>
              </div>

              <div className="flex w-full max-w-xl flex-col gap-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="https://api.example.com/openapi.json"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleStartWithUrl();
                      }}
                      className="pl-9"
                    />
                  </div>
                  <Button
                    onClick={handleStartWithUrl}
                    disabled={!urlInput.trim() || isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Analyze
                  </Button>
                </div>

                <div className="flex items-center gap-4">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <Separator className="flex-1" />
                </div>

                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="w-full"
                >
                  <Upload className="size-4" />
                  Upload API Specification File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.yaml,.yml,.pdf,.md,.txt"
                  onChange={handleStartWithFile}
                  className="hidden"
                />
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-1 py-4">
                {messages.map((msg, idx) => (
                  <ChatMessage
                    key={idx}
                    role={msg.role}
                    content={msg.content}
                    toolCalls={msg.toolCalls}
                  />
                ))}
                {isLoading && (
                  <div className="flex gap-3 px-4 py-3">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                    </div>
                    <div className="rounded-xl bg-card px-4 py-2.5 text-sm text-muted-foreground ring-1 ring-foreground/10">
                      Thinking...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Chat Input */}
        {isStarted && jobId && (
          <div className="border-t border-border px-6 py-4">
            <div className="flex gap-2">
              <Textarea
                placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-10 resize-none"
                rows={1}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading}
                size="icon"
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Config Sidebar */}
      {isStarted && (
        <div className="w-72 border-l border-border bg-card/50">
          <div className="px-4 py-4">
            <h3 className="text-sm font-semibold">Configuration</h3>
          </div>
          <Separator />
          <div className="flex flex-col gap-4 p-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xs">
                  <Hash className="size-3.5" />
                  Endpoints
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold">
                  {config.endpointsCount}
                </span>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xs">
                  <Shield className="size-3.5" />
                  Auth Type
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary">{config.authType}</Badge>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xs">
                  <Server className="size-3.5" />
                  Server Name
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium">
                  {config.serverName || "Not set"}
                </span>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
