// ---------------------------------------------------------------------------
// Centralized API client for mcpgen backend
// ---------------------------------------------------------------------------

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface ApiError {
  detail: string;
  status: number;
}

// -- Specs / Configure --

export interface SpecUploadResponse {
  job_id: string;
  parsed_spec_id: string;
  endpoints_count: number;
}

export interface ConfigStartResponse {
  job_id: string;
  message: string;
  phase: string;
  endpoints_count: number;
  config: Record<string, unknown>;
}

export interface ConfigChatResponse {
  message: string;
  phase: string;
  config: Record<string, unknown>;
  ready_to_generate: boolean;
  job_id: string;
}

export interface ConfigStateResponse {
  job_id: string;
  config: Record<string, unknown>;
  history: Array<ChatMessage>;
  endpoints_count: number;
}

// -- Jobs --

export interface JobDetail {
  id: string;
  status: string;
  input_type: string | null;
  config: Record<string, unknown> | null;
  docker_image_tag: string | null;
  source_archive_path: string | null;
}

export interface JobStatusResponse {
  status: string;
  progress_stage: number;
  total_stages: number;
}

export interface JobConfigureResponse {
  job_id: string;
  status: string;
}

// -- Chat --

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatResponse {
  message: string;
  config_updates: Record<string, unknown> | null;
  endpoint_suggestions: string[] | null;
}

// -- Sandbox --

export interface SandboxStartResponse {
  job_id: string;
  container_id: string;
  mcp_url: string;
  port: number;
  status: string;
  healthy: boolean;
}

export interface SandboxTestResponse {
  response: string;
  tool_calls: Array<Record<string, unknown>>;
  success: boolean;
  error: string | null;
}

export interface SandboxDebugResponse {
  diagnosis: string;
  changes_summary: string;
  sandbox_restarted: boolean;
  fixed_code_preview: string;
}

export interface SandboxLogsResponse {
  logs: string;
}

export interface SandboxStatusResponse {
  status: string;
  mcp_url: string | null;
  port?: number;
  container_id?: string;
}

// -- Artifacts --

export interface CodePreviewResponse {
  files: Array<{ filename: string; content: string }>;
}

export interface DockerInfoResponse {
  image_tag: string;
  pull_command: string;
  run_command: string;
  build_from_source: string;
}

// -- Hosting --

export interface ConnectionConfig {
  description: string;
  url?: string;
  config?: Record<string, unknown>;
  transport?: string;
}

export interface DeployResponse {
  status: string;
  mcp_url: string;
  server_name: string;
  port: number;
  connection_configs: Record<string, ConnectionConfig>;
  delivery_options: Record<string, Record<string, string>>;
}

export interface ConnectionInfoResponse {
  status: string;
  mcp_url?: string;
  server_name?: string;
}

// -- Endpoints --

export interface EndpointSummary {
  id: string;
  method: string;
  path: string;
  summary: string;
  tag: string;
  parameters_count: number;
}

// -- Auth config used by configure --

export interface AuthStrategy {
  type: string;
  header_name: string | null;
  env_var_name: string | null;
}

export interface JobConfig {
  selected_endpoints: string[];
  auth_strategy: AuthStrategy;
  server_name: string;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

class ApiRequestError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`API error ${status}: ${detail}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ detail: response.statusText }));
    throw new ApiRequestError(
      response.status,
      body.detail ?? `HTTP ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ detail: response.statusText }));
    throw new ApiRequestError(
      response.status,
      body.detail ?? `Upload failed with HTTP ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Namespaced API
// ---------------------------------------------------------------------------

export const api = {
  // -- Configure (chat-first flow) --
  configure: {
    startFromUrl(url: string): Promise<ConfigStartResponse> {
      return post<ConfigStartResponse>("/configure/start/url", { url });
    },

    startFromUpload(file: File): Promise<ConfigStartResponse> {
      return uploadFile<ConfigStartResponse>("/configure/start/upload", file);
    },

    chat(jobId: string, message: string): Promise<ConfigChatResponse> {
      return post<ConfigChatResponse>(`/configure/${jobId}/chat`, { message });
    },

    getState(jobId: string): Promise<ConfigStateResponse> {
      return get<ConfigStateResponse>(`/configure/${jobId}/state`);
    },
  },

  // -- Jobs --
  jobs: {
    get(jobId: string): Promise<JobDetail> {
      return get<JobDetail>(`/jobs/${jobId}`);
    },

    status(jobId: string): Promise<JobStatusResponse> {
      return get<JobStatusResponse>(`/jobs/${jobId}/status`);
    },

    configure(jobId: string, config: JobConfig): Promise<JobConfigureResponse> {
      return post<JobConfigureResponse>(`/jobs/${jobId}/configure`, config);
    },

    generate(jobId: string): Promise<JobConfigureResponse> {
      return post<JobConfigureResponse>(`/jobs/${jobId}/generate`, {});
    },
  },

  // -- Sandbox --
  sandbox: {
    start(
      jobId: string,
      envVars: Record<string, string>,
    ): Promise<SandboxStartResponse> {
      return post<SandboxStartResponse>(`/sandbox/${jobId}/start`, {
        env_vars: envVars,
      });
    },

    test(jobId: string, message: string): Promise<SandboxTestResponse> {
      return post<SandboxTestResponse>(`/sandbox/${jobId}/test`, { message });
    },

    debug(
      jobId: string,
      errorDescription: string,
      failedTool: string | null,
    ): Promise<SandboxDebugResponse> {
      return post<SandboxDebugResponse>(`/sandbox/${jobId}/debug`, {
        error_description: errorDescription,
        failed_tool: failedTool,
      });
    },

    logs(jobId: string): Promise<SandboxLogsResponse> {
      return get<SandboxLogsResponse>(`/sandbox/${jobId}/logs`);
    },

    status(jobId: string): Promise<SandboxStatusResponse> {
      return get<SandboxStatusResponse>(`/sandbox/${jobId}/status`);
    },

    stop(jobId: string): Promise<{ status: string }> {
      return del<{ status: string }>(`/sandbox/${jobId}`);
    },
  },

  // -- Artifacts --
  artifacts: {
    code(jobId: string): Promise<CodePreviewResponse> {
      return get<CodePreviewResponse>(`/jobs/${jobId}/artifacts/code`);
    },

    dockerInfo(jobId: string): Promise<DockerInfoResponse> {
      return get<DockerInfoResponse>(`/jobs/${jobId}/artifacts/docker-info`);
    },

    downloadSource(jobId: string): Promise<Blob> {
      return fetch(`${BASE_URL}/jobs/${jobId}/artifacts/source`).then(
        (response) => {
          if (!response.ok) {
            throw new ApiRequestError(response.status, "Download failed");
          }
          return response.blob();
        },
      );
    },
  },

  // -- Hosting --
  hosting: {
    deploy(
      jobId: string,
      envVars: Record<string, string>,
    ): Promise<DeployResponse> {
      return post<DeployResponse>(`/hosting/${jobId}/deploy`, {
        env_vars: envVars,
      });
    },

    connectionInfo(jobId: string): Promise<ConnectionInfoResponse> {
      return get<ConnectionInfoResponse>(`/hosting/${jobId}/connection-info`);
    },
  },

  // -- Specs (legacy wizard flow) --
  specs: {
    upload(file: File): Promise<SpecUploadResponse> {
      return uploadFile<SpecUploadResponse>("/specs/upload", file);
    },

    fromUrl(url: string): Promise<SpecUploadResponse> {
      return post<SpecUploadResponse>("/specs/from-url", { url });
    },

    endpoints(jobId: string): Promise<EndpointSummary[]> {
      return get<EndpointSummary[]>(`/specs/${jobId}/endpoints`);
    },
  },

  // -- Chat (legacy) --
  chat: {
    send(jobId: string, message: string): Promise<ChatResponse> {
      return post<ChatResponse>(`/jobs/${jobId}/chat`, { message });
    },

    history(jobId: string): Promise<ChatMessage[]> {
      return get<ChatMessage[]>(`/jobs/${jobId}/chat/history`);
    },
  },
} as const;
