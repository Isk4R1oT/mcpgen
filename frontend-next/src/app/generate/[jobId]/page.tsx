"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { GenerationProgress } from "@/components/generate/generation-progress";
import {
  Download,
  Play,
  Copy,
  Check,
  FileCode,
  Container,
  Cable,
  ChevronLeft,
} from "lucide-react";

type FileEntry = {
  filename: string;
  content: string;
};

type DockerInfo = {
  pull_command: string;
  run_command: string;
  build_from_source: string;
};

type JobStatus = {
  status: string;
  progress_stage: number;
  total_stages: number;
};

export default function GenerationResultPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [jobStatus, setJobStatus] = useState<JobStatus>({
    status: "running",
    progress_stage: 1,
    total_stages: 5,
  });
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
  const [selectedFile, setSelectedFile] = useState(0);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const isCompleted = jobStatus.status === "completed";
  const isFailed = jobStatus.status === "failed";

  const fetchArtifacts = useCallback(async () => {
    try {
      const [codeRes, dockerRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}/artifacts/code`),
        fetch(`/api/jobs/${jobId}/artifacts/docker-info`),
      ]);

      if (codeRes.ok) {
        const codeData = await codeRes.json();
        setFiles(codeData.files ?? []);
      }
      if (dockerRes.ok) {
        const dockerData = await dockerRes.json();
        setDockerInfo(dockerData);
      }
    } catch {
      // Artifacts not ready yet
    }
  }, [jobId]);

  useEffect(() => {
    if (isCompleted || isFailed) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/status`);
        if (!res.ok) return;
        const data: JobStatus = await res.json();
        setJobStatus(data);

        if (data.status === "completed") {
          clearInterval(interval);
          fetchArtifacts();
        }
        if (data.status === "failed") {
          clearInterval(interval);
        }
      } catch {
        // Retry on next interval
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, isCompleted, isFailed, fetchArtifacts]);

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const CopyButton = ({ text, label }: { text: string; label: string }) => (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={() => copyToClipboard(text, label)}
    >
      {copiedText === label ? (
        <Check className="size-3" />
      ) : (
        <Copy className="size-3" />
      )}
    </Button>
  );

  const connectionConfigs: Record<string, string> = {
    "Claude Desktop": JSON.stringify(
      {
        mcpServers: {
          generated: {
            command: "docker",
            args: ["run", "-i", "--rm", `mcpgen-${jobId}`],
          },
        },
      },
      null,
      2,
    ),
    Cursor: JSON.stringify(
      {
        mcpServers: {
          generated: {
            url: `http://localhost:8080/mcp`,
          },
        },
      },
      null,
      2,
    ),
    "Claude Code": `claude mcp add generated http://localhost:8080/mcp`,
    Docker: dockerInfo?.run_command ?? "Loading...",
  };

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => router.push("/generate")}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">Generation Progress</h1>
              <p className="text-xs text-muted-foreground">Job: {jobId}</p>
            </div>
          </div>
          {isCompleted && (
            <div className="flex gap-2">
              <a href={`/api/jobs/${jobId}/artifacts/code`} download>
                <Button variant="outline">
                  <Download className="size-4" />
                  Download .tar.gz
                </Button>
              </a>
              <Button onClick={() => router.push(`/sandbox/${jobId}`)}>
                <Play className="size-4" />
                Test with AI Agent
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Progress Stepper */}
        <Card className="mb-8">
          <CardContent className="pt-2">
            <GenerationProgress
              currentStage={jobStatus.progress_stage}
              totalStages={jobStatus.total_stages}
              status={jobStatus.status}
            />
          </CardContent>
        </Card>

        {/* Loading skeleton */}
        {!isCompleted && !isFailed && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {/* Failed state */}
        {isFailed && (
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">
                Generation Failed
              </CardTitle>
              <CardDescription>
                An error occurred during generation. Please try again.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={() => router.push("/generate")}
              >
                Start Over
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {isCompleted && (
          <Tabs defaultValue="code">
            <TabsList>
              <TabsTrigger value="code">
                <FileCode className="size-3.5" />
                Code Preview
              </TabsTrigger>
              <TabsTrigger value="docker">
                <Container className="size-3.5" />
                Docker
              </TabsTrigger>
              <TabsTrigger value="connection">
                <Cable className="size-3.5" />
                Connection Configs
              </TabsTrigger>
            </TabsList>

            {/* Code Preview Tab */}
            <TabsContent value="code" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <div className="flex">
                    {/* File List */}
                    <div className="w-56 border-r border-border">
                      <div className="p-3">
                        <span className="text-xs font-medium text-muted-foreground">
                          FILES ({files.length})
                        </span>
                      </div>
                      <Separator />
                      <ScrollArea className="h-[500px]">
                        <div className="flex flex-col">
                          {files.map((file, idx) => (
                            <button
                              key={file.filename}
                              onClick={() => setSelectedFile(idx)}
                              className={`px-3 py-2 text-left text-xs font-mono transition-colors hover:bg-muted ${
                                idx === selectedFile
                                  ? "bg-muted text-foreground"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {file.filename}
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>

                    {/* Code Content */}
                    <div className="flex-1">
                      <div className="flex items-center justify-between border-b border-border px-4 py-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {files[selectedFile]?.filename}
                        </span>
                        {files[selectedFile] && (
                          <CopyButton
                            text={files[selectedFile].content}
                            label={`file-${selectedFile}`}
                          />
                        )}
                      </div>
                      <ScrollArea className="h-[500px]">
                        <pre className="p-4 font-mono text-xs leading-relaxed text-foreground">
                          <code>{files[selectedFile]?.content}</code>
                        </pre>
                      </ScrollArea>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Docker Tab */}
            <TabsContent value="docker" className="mt-4">
              <div className="flex flex-col gap-4">
                {dockerInfo ? (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Pull Command</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                          <code className="font-mono text-sm">
                            {dockerInfo.pull_command}
                          </code>
                          <CopyButton
                            text={dockerInfo.pull_command}
                            label="pull"
                          />
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Run Command</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                          <code className="font-mono text-sm break-all">
                            {dockerInfo.run_command}
                          </code>
                          <CopyButton
                            text={dockerInfo.run_command}
                            label="run"
                          />
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">
                          Build from Source
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <pre className="rounded-lg bg-muted p-3 font-mono text-sm whitespace-pre-wrap">
                          {dockerInfo.build_from_source}
                        </pre>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Skeleton className="h-48 w-full" />
                )}
              </div>
            </TabsContent>

            {/* Connection Configs Tab */}
            <TabsContent value="connection" className="mt-4">
              <Tabs defaultValue="Claude Desktop">
                <TabsList>
                  {Object.keys(connectionConfigs).map((name) => (
                    <TabsTrigger key={name} value={name}>
                      {name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {Object.entries(connectionConfigs).map(([name, config]) => (
                  <TabsContent key={name} value={name} className="mt-4">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">
                            {name} Configuration
                          </CardTitle>
                          <CopyButton text={config} label={`config-${name}`} />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <pre className="rounded-lg bg-muted p-4 font-mono text-sm leading-relaxed">
                          {config}
                        </pre>
                      </CardContent>
                    </Card>
                  </TabsContent>
                ))}
              </Tabs>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
