import { buildInviteUrl, type InvitePayload } from "@domain/invite";
import { loadProfiles } from "@domain/profiles";
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
  profileId: string;
  defaultOpen?: boolean;
}

export function GitHubConfigForm({ profileId, defaultOpen = false }: GitHubConfigFormProps) {
  const { t } = useTranslation();
  const existing = loadSyncConfig(profileId);
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
      saveSyncConfig(profileId, config);
      setStatus({ type: "connected", repo: fullName });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus({ type: "error", message });
    }
  }, [repoInput, tokenInput, profileId]);

  const handleDisconnect = useCallback(() => {
    clearSyncConfig(profileId);
    setRepoInput("");
    setTokenInput("");
    setStatus({ type: "disconnected" });
  }, [profileId]);

  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);

  const handleInvite = useCallback(async () => {
    const config = loadSyncConfig(profileId);
    if (!config || config.adapter !== "github") return;

    const profile = loadProfiles().find((p) => p.id === profileId);
    const payload: InvitePayload = {
      profile: { name: profile?.name ?? "Band", avatar: profile?.avatar },
      sync: {
        adapter: "github",
        owner: config.owner,
        repo: config.repo,
        token: config.token,
        path: config.path,
      },
    };

    const url = buildInviteUrl(payload);

    try {
      await navigator.clipboard.writeText(url);
      setInviteFeedback(t("invite.linkCopied"));

      if (navigator.share) {
        try {
          await navigator.share({ url });
        } catch {
          // User cancelled share — link is still copied
        }
      }
    } catch {
      setInviteFeedback(t("invite.shareFailed"));
    }

    setTimeout(() => setInviteFeedback(null), 3000);
  }, [profileId, t]);

  return (
    <details
      id="github"
      open={defaultOpen || undefined}
      className="accordion group rounded-md border border-border"
    >
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold select-none">
        <GitHubIcon className="h-4 w-4" />
        {t("settings.github.heading")}
        {isConnected && (
          <span className="mr-2 rounded-full bg-accent-muted px-2 py-0.5 text-xs text-accent">
            {t("settings.github.connected", { repo: `${existing.owner}/${existing.repo}` })}
          </span>
        )}
      </summary>

      <div className="accordion-content">
        <div className="accordion-inner">
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
            </div>

            <div aria-live="polite">
              {status.type === "connected" && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-accent">
                    {t("settings.github.connected", { repo: status.repo })}
                  </p>
                  <button
                    type="button"
                    onClick={handleInvite}
                    className="btn btn-outline self-start"
                  >
                    {t("invite.inviteMembers")}
                  </button>
                  {inviteFeedback && <p className="text-sm text-accent">{inviteFeedback}</p>}
                </div>
              )}
              {status.type === "error" && (
                <p className="text-sm text-danger">
                  {t("settings.github.connectionFailed", { error: status.message })}
                </p>
              )}
              {status.type === "disconnected" && (
                <p className="text-sm text-text-muted">{t("settings.github.disconnected")}</p>
              )}
            </div>

            <p className="text-xs text-text-faint">{t("settings.github.tokenHelp")}</p>

            {status.type === "connected" && (
              <button
                type="button"
                onClick={handleDisconnect}
                className="btn btn-danger self-start"
              >
                {t("settings.github.disconnect")}
              </button>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
