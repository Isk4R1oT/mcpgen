import { useEffect, useState } from "react";
import { getEndpoints } from "../../api/client";

interface Endpoint {
  id: string;
  method: string;
  path: string;
  summary: string;
  tag: string;
  parameters_count: number;
}

interface Props {
  jobId: string;
  selected: string[];
  onSelectionChange: (ids: string[]) => void;
  onNext: () => void;
}

const METHOD_COLORS: Record<string, string> = {
  GET: "#61affe",
  POST: "#49cc90",
  PUT: "#fca130",
  DELETE: "#f93e3e",
  PATCH: "#50e3c2",
};

export function StepEndpoints({ jobId, selected, onSelectionChange, onNext }: Props) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEndpoints(jobId).then((eps) => {
      setEndpoints(eps);
      onSelectionChange(eps.map((e) => e.id));
      setLoading(false);
    });
  }, [jobId]);

  const toggle = (id: string) => {
    onSelectionChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id]
    );
  };

  const toggleAll = () => {
    onSelectionChange(
      selected.length === endpoints.length ? [] : endpoints.map((e) => e.id)
    );
  };

  if (loading) return <p>Loading endpoints...</p>;

  const tags = [...new Set(endpoints.map((e) => e.tag))];

  return (
    <div className="step">
      <h2>Step 2: Select Endpoints</h2>
      <p>{selected.length} of {endpoints.length} endpoints selected</p>

      <button onClick={toggleAll} className="btn-secondary">
        {selected.length === endpoints.length ? "Deselect All" : "Select All"}
      </button>

      {tags.map((tag) => (
        <div key={tag} className="endpoint-group">
          <h3>{tag}</h3>
          {endpoints.filter((e) => e.tag === tag).map((ep) => (
            <label key={ep.id} className="endpoint-row">
              <input
                type="checkbox"
                checked={selected.includes(ep.id)}
                onChange={() => toggle(ep.id)}
              />
              <span
                className="method-badge"
                style={{ backgroundColor: METHOD_COLORS[ep.method] || "#999" }}
              >
                {ep.method}
              </span>
              <span className="endpoint-path">{ep.path}</span>
              <span className="endpoint-summary">{ep.summary}</span>
            </label>
          ))}
        </div>
      ))}

      <button onClick={onNext} disabled={selected.length === 0} className="btn-primary">
        Next: Configure Auth
      </button>
    </div>
  );
}
