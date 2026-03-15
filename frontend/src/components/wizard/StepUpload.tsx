import { useCallback, useState } from "react";
import { uploadSpec } from "../../api/client";

interface Props {
  onUploaded: (jobId: string, endpointsCount: number) => void;
}

export function StepUpload({ onUploaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const result = await uploadSpec(file);
      onUploaded(result.job_id, result.endpoints_count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }, [onUploaded]);

  return (
    <div className="step">
      <h2>Step 1: Upload API Specification</h2>
      <p>Upload an OpenAPI/Swagger spec file (YAML or JSON)</p>

      <div
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        {loading ? (
          <p>Parsing specification...</p>
        ) : (
          <>
            <p>Drag & drop your spec file here</p>
            <p>or</p>
            <label className="file-button">
              Browse files
              <input
                type="file"
                accept=".yaml,.yml,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
                hidden
              />
            </label>
          </>
        )}
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
