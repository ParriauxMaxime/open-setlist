import { createGitHubAdapter } from "@domain/sync/adapters/github";
import {
  clearSyncConfig,
  type GitHubConfig,
  loadSyncConfig,
  saveSyncConfig,
} from "@domain/sync/config";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitHubIcon } from "../../design-system/components/icons";

type Status =
  | { type: "idle" }
  | { type: "testing" }
  | { type: "connected"; repo: string }
  | { type: "error"; message: string }
  | { type: "disconnected" };

interface GitHubConfigFormProps {
  defaultOpen?: boolean;
}

export function GitHubConfigForm({ defaultOpen = false }: GitHubConfigFormProps) {
  const { t } = useTranslation();
  const existing = loadSyncConfig();
  const isConnected = existing?.adapter === "github";

  const [repoInput, setRepoInput] = useState(
    isConnected ? `${existing.owner}/${existing.repo}` : "",
  );
  const [tokenInput, setTokenInput] = useState(isConnected ? existing.token : "");
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<Status>(
    isConnected
      ? { type: "connected", repo: `${existing.owner}/${existing.repo}` }
      : { type: "idle" },
  );

  const handleTest = useCallback(async () => {
    const parts = repoInput.trim().split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setStatus({ type: "error", message: "Invalid repository format. Use owner/repo." });
      return;
    }
    const [owner, repo] = parts;
    const token = tokenInput.trim();
    if (!token) {
      setStatus({ type: "error", message: "Token is required." });
      return;
    }

    setStatus({ type: "testing" });

    const config: GitHubConfig = {
      adapter: "github",
      owner,
      repo,
      token,
      path: "setlist.json",
      lastVersionToken: null,
      lastSyncedAt: null,
    };

    const adapter = createGitHubAdapter(config);
    try {
      const fullName = await adapter.testConnection();
      saveSyncConfig(config);
      setStatus({ type: "connected", repo: fullName });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus({ type: "error", message });
    }
  }, [repoInput, tokenInput]);

  const handleDisconnect = useCallback(() => {
    clearSyncConfig();
    setRepoInput("");
    setTokenInput("");
    setStatus({ type: "disconnected" });
  }, []);

  return (
    <details
      id="github"
      open={defaultOpen || undefined}
      className="group rounded-md border border-border"
    >
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold select-none">
        <GitHubIcon className="h-4 w-4" />
        {t("settings.github.heading")}
        {isConnected && (
          <span className="ml-auto rounded-full bg-accent-muted px-2 py-0.5 text-xs text-accent">
            {t("settings.github.connected", { repo: `${existing.owner}/${existing.repo}` })}
          </span>
        )}
      </summary>

      <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
        <p className="text-sm text-text-muted">{t("settings.github.desc")}</p>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-text">{t("settings.github.repo")}</span>
          <input
            type="text"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder={t("settings.github.repoPlaceholder")}
            className="field"
            disabled={status.type === "testing"}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-text">{t("settings.github.token")}</span>
          <div className="flex gap-2">
            <input
              type={showToken ? "text" : "password"}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={t("settings.github.tokenPlaceholder")}
              className="field flex-1"
              disabled={status.type === "testing"}
            />
            <button
              type="button"
              onClick={() => setShowToken((s) => !s)}
              className="btn btn-ghost text-xs"
            >
              {showToken ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={status.type === "testing"}
            className="btn btn-outline"
          >
            {status.type === "testing"
              ? t("settings.github.testing")
              : t("settings.github.testConnection")}
          </button>

          {status.type === "connected" && (
            <button type="button" onClick={handleDisconnect} className="btn btn-ghost text-danger">
              {t("settings.github.disconnect")}
            </button>
          )}
        </div>

        {status.type === "connected" && (
          <p className="text-sm text-accent">
            {t("settings.github.connected", { repo: status.repo })}
          </p>
        )}
        {status.type === "error" && (
          <p className="text-sm text-danger">
            {t("settings.github.connectionFailed", { error: status.message })}
          </p>
        )}
        {status.type === "disconnected" && (
          <p className="text-sm text-text-muted">{t("settings.github.disconnected")}</p>
        )}

        <p className="text-xs text-text-faint">{t("settings.github.tokenHelp")}</p>
      </div>
    </details>
  );
}
