export interface EndpointSummary {
  id: string;
  method: string;
  path: string;
  summary: string;
  tag: string;
  parameters_count: number;
}

export interface AuthConfig {
  type: "none" | "api_key" | "bearer" | "oauth2";
  header_name?: string;
  env_var_name?: string;
}

export interface JobConfiguration {
  selected_endpoints: string[];
  auth_strategy: AuthConfig;
  server_name: string;
}

export interface JobStatus {
  status: string;
  progress_stage: number;
  total_stages: number;
}

export interface JobDetail {
  id: string;
  status: string;
  input_type?: string;
  config?: JobConfiguration;
  docker_image_tag?: string;
  source_archive_path?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  message: string;
  config_updates?: Record<string, unknown>;
  endpoint_suggestions?: string[];
}

export interface DockerInfo {
  image_tag: string;
  pull_command: string;
  run_command: string;
  build_from_source: string;
}

export interface CodeFile {
  filename: string;
  content: string;
}
