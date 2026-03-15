interface AuthConfig {
  type: "none" | "api_key" | "bearer" | "oauth2";
  header_name?: string;
  env_var_name?: string;
}

interface Props {
  auth: AuthConfig;
  onAuthChange: (auth: AuthConfig) => void;
  onNext: () => void;
}

export function StepAuth({ auth, onAuthChange, onNext }: Props) {
  return (
    <div className="step">
      <h2>Step 3: Configure Authentication</h2>

      <div className="auth-options">
        {(["none", "api_key", "bearer", "oauth2"] as const).map((type) => (
          <label key={type} className="auth-option">
            <input
              type="radio"
              name="auth"
              checked={auth.type === type}
              onChange={() => onAuthChange({ type })}
            />
            <span>
              {type === "none"
                ? "No Auth"
                : type === "api_key"
                  ? "API Key"
                  : type === "bearer"
                    ? "Bearer Token"
                    : "OAuth2"}
            </span>
          </label>
        ))}
      </div>

      {auth.type === "api_key" && (
        <div className="auth-details">
          <label>
            Header Name
            <input
              type="text"
              value={auth.header_name || ""}
              onChange={(e) =>
                onAuthChange({ ...auth, header_name: e.target.value })
              }
              placeholder="e.g. X-API-Key"
            />
          </label>
          <label>
            Env Variable Name
            <input
              type="text"
              value={auth.env_var_name || ""}
              onChange={(e) =>
                onAuthChange({ ...auth, env_var_name: e.target.value })
              }
              placeholder="e.g. API_KEY"
            />
          </label>
        </div>
      )}

      <button onClick={onNext} className="btn-primary">
        Next: Review & Generate
      </button>
    </div>
  );
}
