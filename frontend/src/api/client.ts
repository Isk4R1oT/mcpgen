const BASE_URL = "http://localhost:8000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function uploadSpec(file: File): Promise<{ job_id: string; endpoints_count: number }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${BASE_URL}/specs/upload`, { method: "POST", body: formData });
  if (!response.ok) throw new Error("Upload failed");
  return response.json();
}

export async function getEndpoints(jobId: string) {
  return request<Array<{ id: string; method: string; path: string; summary: string; tag: string; parameters_count: number }>>(`/specs/${jobId}/endpoints`);
}

export async function configureJob(jobId: string, config: { selected_endpoints: string[]; auth_strategy: { type: string; header_name?: string; env_var_name?: string }; server_name: string }) {
  return request<{ job_id: string; status: string }>(`/jobs/${jobId}/configure`, {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function startGeneration(jobId: string) {
  return request<{ job_id: string; status: string }>(`/jobs/${jobId}/generate`, { method: "POST" });
}

export async function getJobStatus(jobId: string) {
  return request<{ status: string; progress_stage: number; total_stages: number }>(`/jobs/${jobId}/status`);
}

export async function downloadSource(jobId: string): Promise<Blob> {
  const response = await fetch(`${BASE_URL}/jobs/${jobId}/artifacts/source`);
  if (!response.ok) throw new Error("Download failed");
  return response.blob();
}

export async function getCodePreview(jobId: string) {
  return request<{ files: Array<{ filename: string; content: string }> }>(`/jobs/${jobId}/artifacts/code`);
}

export async function getDockerInfo(jobId: string) {
  return request<{ image_tag: string; pull_command: string; run_command: string; build_from_source: string }>(`/jobs/${jobId}/artifacts/docker-info`);
}

export async function sendChatMessage(jobId: string, message: string) {
  return request<{ message: string; config_updates?: Record<string, unknown>; endpoint_suggestions?: string[] }>(`/jobs/${jobId}/chat`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function getChatHistory(jobId: string) {
  return request<Array<{ role: string; content: string }>>(`/jobs/${jobId}/chat/history`);
}
