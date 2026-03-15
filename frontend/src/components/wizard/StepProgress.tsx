import { useEffect, useState } from "react";
import { getJobStatus } from "../../api/client";

interface Props {
  jobId: string;
  onCompleted: () => void;
  onFailed: (error: string) => void;
}

const STAGES = ["Parsing", "Analyzing", "Generating", "Validating", "Packaging"];

export function StepProgress({ jobId, onCompleted, onFailed }: Props) {
  const [stage, setStage] = useState(0);
  const [status, setStatus] = useState("parsing");

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const result = await getJobStatus(jobId);
        setStatus(result.status);
        setStage(result.progress_stage);

        if (result.status === "completed") {
          clearInterval(interval);
          onCompleted();
        } else if (result.status === "failed") {
          clearInterval(interval);
          onFailed("Generation failed. Check server logs.");
        }
      } catch {
        // Keep polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, onCompleted, onFailed]);

  return (
    <div className="step">
      <h2>Step 5: Generating MCP Server</h2>

      <div className="progress-stages">
        {STAGES.map((name, i) => (
          <div
            key={name}
            className={`progress-stage ${i < stage ? "done" : i === stage ? "active" : ""}`}
          >
            <div className="stage-dot" />
            <span>{name}</span>
          </div>
        ))}
      </div>

      <p className="status-text">
        {status === "completed" ? "Done!" : `${STAGES[stage] || "Processing"}...`}
      </p>
    </div>
  );
}
