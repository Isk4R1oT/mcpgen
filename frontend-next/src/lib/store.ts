// ---------------------------------------------------------------------------
// Zustand store — global state for the mcpgen frontend
// ---------------------------------------------------------------------------

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Phase =
  | "idle"
  | "uploading"
  | "configuring"
  | "generating"
  | "sandbox"
  | "deploying"
  | "completed"
  | "error";

export type GenerationStatus =
  | "pending"
  | "configured"
  | "parsing"
  | "analyzing"
  | "generating"
  | "validating"
  | "packaging"
  | "completed"
  | "failed";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AuthConfig {
  type: string;
  headerName: string | null;
  envVarName: string | null;
}

export interface McpConfig {
  selectedEndpoints: string[];
  auth: AuthConfig | null;
  serverName: string;
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface AppState {
  currentJobId: string | null;
  messages: ChatMessage[];
  config: McpConfig;
  phase: Phase;
  generationStatus: GenerationStatus;

  // Actions
  setCurrentJobId: (jobId: string | null) => void;
  addMessage: (role: "user" | "assistant", content: string) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setConfig: (partial: Partial<McpConfig>) => void;
  setPhase: (phase: Phase) => void;
  setGenerationStatus: (status: GenerationStatus) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Initial values
// ---------------------------------------------------------------------------

const initialConfig: McpConfig = {
  selectedEndpoints: [],
  auth: null,
  serverName: "",
};

const initialState = {
  currentJobId: null,
  messages: [] as ChatMessage[],
  config: initialConfig,
  phase: "idle" as Phase,
  generationStatus: "pending" as GenerationStatus,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAppStore = create<AppState>()((set) => ({
  ...initialState,

  setCurrentJobId: (jobId) => set({ currentJobId: jobId }),

  addMessage: (role, content) =>
    set((state) => ({
      messages: [...state.messages, { role, content }],
    })),

  setMessages: (messages) => set({ messages }),

  setConfig: (partial) =>
    set((state) => ({
      config: { ...state.config, ...partial },
    })),

  setPhase: (phase) => set({ phase }),

  setGenerationStatus: (status) => set({ generationStatus: status }),

  reset: () => set(initialState),
}));
