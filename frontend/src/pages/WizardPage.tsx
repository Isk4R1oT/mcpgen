import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { StepUpload } from "../components/wizard/StepUpload";
import { StepEndpoints } from "../components/wizard/StepEndpoints";
import { StepAuth } from "../components/wizard/StepAuth";
import { StepReview } from "../components/wizard/StepReview";
import { StepProgress } from "../components/wizard/StepProgress";
import { ChatPanel } from "../components/chat/ChatPanel";
import { configureJob, startGeneration } from "../api/client";

type Step = 1 | 2 | 3 | 4 | 5;

interface AuthConfig {
  type: "none" | "api_key" | "bearer" | "oauth2";
  header_name?: string;
  env_var_name?: string;
}

export function WizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [jobId, setJobId] = useState<string | null>(null);
  const [selectedEndpoints, setSelectedEndpoints] = useState<string[]>([]);
  const [auth, setAuth] = useState<AuthConfig>({ type: "none" });
  const [serverName, setServerName] = useState("my-mcp-server");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!jobId) return;
    setGenerating(true);
    setError(null);
    try {
      await configureJob(jobId, {
        selected_endpoints: selectedEndpoints,
        auth_strategy: auth,
        server_name: serverName,
      });
      await startGeneration(jobId);
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start generation");
    } finally {
      setGenerating(false);
    }
  }, [jobId, selectedEndpoints, auth, serverName]);

  return (
    <div className="wizard-page">
      <div className="wizard-steps-nav">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className={`step-indicator ${s === step ? "active" : s < step ? "done" : ""}`}>
            {s}
          </div>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {step === 1 && (
        <StepUpload onUploaded={(id) => { setJobId(id); setStep(2); }} />
      )}
      {step === 2 && jobId && (
        <StepEndpoints
          jobId={jobId}
          selected={selectedEndpoints}
          onSelectionChange={setSelectedEndpoints}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <StepAuth auth={auth} onAuthChange={setAuth} onNext={() => setStep(4)} />
      )}
      {step === 4 && (
        <StepReview
          serverName={serverName}
          onServerNameChange={setServerName}
          selectedCount={selectedEndpoints.length}
          authType={auth.type}
          onGenerate={handleGenerate}
          loading={generating}
        />
      )}
      {step === 5 && jobId && (
        <StepProgress
          jobId={jobId}
          onCompleted={() => navigate(`/result/${jobId}`)}
          onFailed={(err) => setError(err)}
        />
      )}

      {jobId && step >= 2 && step <= 4 && (
        <ChatPanel jobId={jobId} />
      )}
    </div>
  );
}
