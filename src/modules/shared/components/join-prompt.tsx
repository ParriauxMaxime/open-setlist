import { openProfileDb } from "@db";
import { requestAccessToken } from "@domain/google-auth";
import {
  applyInvite,
  clearInviteParam,
  exposesToken,
  extractInviteParam,
  GITHUB_TOKEN_DOCS_URL,
  type InvitePayload,
  openSealedInvite,
  parseInvite,
} from "@domain/invite";
import {
  type AppPreferences,
  appPreferencesSchema,
  loadPreferences,
  savePreferences,
} from "@domain/preferences";
import { createGitHubAdapter } from "@domain/sync/adapters/github";
import { createGoogleDriveAdapter } from "@domain/sync/adapters/google-drive";
import { loadSyncConfig } from "@domain/sync/config";
import { sync } from "@domain/sync/orchestrator";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { useFocusTrap } from "../hooks/use-focus-trap";

type Instrument = AppPreferences["favoriteInstrument"];
const INSTRUMENTS = appPreferencesSchema.shape.favoriteInstrument.unwrap().options;

type Status =
  | { type: "locked"; sealed: string }
  | { type: "idle"; payload: InvitePayload; exposesToken: boolean }
  | { type: "joining" }
  | { type: "joined" }
  | { type: "error"; message: string };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

export function JoinPrompt() {
  const { t } = useTranslation();

  // Extract invite param eagerly during render (before the Home→Catalog
  // redirect strips the query string).
  const [status, setStatus] = useState<Status | null>(() => {
    const encoded = extractInviteParam();
    if (!encoded) return null;
    const invite = parseInvite(encoded);
    if (!invite) {
      clearInviteParam();
      return null;
    }
    if (invite.kind === "encrypted") return { type: "locked", sealed: invite.sealed };
    return { type: "idle", payload: invite.payload, exposesToken: exposesToken(invite) };
  });

  // Secrets live in component state only and are cleared once used.
  const [passphrase, setPassphrase] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [wrongPassphrase, setWrongPassphrase] = useState(false);
  const [ownToken, setOwnToken] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [instrument, setInstrument] = useState<Instrument>(
    () => loadPreferences().favoriteInstrument,
  );

  const trapRef = useFocusTrap(status !== null);

  // Each step replaces the focused element: move focus to the new step.
  const step = status?.type;
  useEffect(() => {
    if (step) trapRef.current?.querySelector<HTMLElement>("input, button")?.focus();
  }, [step, trapRef]);

  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault();
    if (status?.type !== "locked" || unlocking) return;
    setUnlocking(true);
    setWrongPassphrase(false);
    try {
      const payload = await openSealedInvite(status.sealed, passphrase);
      setPassphrase("");
      setStatus({ type: "idle", payload, exposesToken: false });
    } catch {
      setWrongPassphrase(true);
    } finally {
      setUnlocking(false);
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (status?.type !== "idle") return;
    let { payload } = status;
    const token = ownToken.trim();
    const tokenless = payload.sync.adapter === "github" && !payload.sync.token;
    if (tokenless && !token) return;

    setStatus({ type: "joining" });
    setTokenError(null);

    // Token-less invite: check the member's own token before creating anything.
    if (tokenless && payload.sync.adapter === "github") {
      const github = { ...payload.sync, token };
      try {
        await createGitHubAdapter({
          ...github,
          lastVersionToken: null,
          lastSyncedAt: null,
        }).testConnection();
      } catch (err) {
        const repo = `${github.owner}/${github.repo}`;
        setTokenError(t("invite.tokenRejected", { repo, error: errorMessage(err) }));
        setStatus(status);
        return;
      }
      payload = { ...payload, sync: github };
    }

    try {
      const profileId = applyInvite(payload);
      clearInviteParam();
      setOwnToken("");

      // Trigger first sync
      const config = loadSyncConfig(profileId);
      if (config) {
        const db = openProfileDb(profileId);
        if (config.adapter === "github") {
          const adapter = createGitHubAdapter(config);
          await sync(adapter, db, profileId);
        } else if (config.adapter === "google-drive") {
          await requestAccessToken();
          const adapter = createGoogleDriveAdapter(config);
          await sync(adapter, db, profileId);
        }
      }

      setStatus({ type: "joined" });
      Router.replace("Catalog");
    } catch (err) {
      setStatus({ type: "error", message: errorMessage(err) });
    }
  };

  const handleCancel = () => {
    clearInviteParam();
    setPassphrase("");
    setOwnToken("");
    setStatus(null);
  };

  const handleSaveInstrument = () => {
    savePreferences({ ...loadPreferences(), favoriteInstrument: instrument });
    setStatus(null);
  };

  // Close on Escape
  useEffect(() => {
    if (!status) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (status.type === "locked" || status.type === "idle") handleCancel();
      if (status.type === "joined") setStatus(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });

  if (!status) return null;

  const needsToken =
    status.type === "idle" &&
    status.payload.sync.adapter === "github" &&
    !status.payload.sync.token;
  const repoName =
    status.type === "idle" && status.payload.sync.adapter === "github"
      ? `${status.payload.sync.owner}/${status.payload.sync.repo}`
      : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        className="flex max-h-full w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-xl bg-bg p-6 shadow-xl"
      >
        {status.type === "locked" && (
          <form onSubmit={handleUnlock} className="flex flex-col gap-4">
            <h2 className="text-lg font-bold">{t("invite.lockedTitle")}</h2>
            <p className="text-sm text-text-muted">{t("invite.lockedMessage")}</p>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-text">{t("invite.passphrase")}</span>
              <input
                type="text"
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value);
                  setWrongPassphrase(false);
                }}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={wrongPassphrase}
                className="field font-mono"
                disabled={unlocking}
              />
            </label>
            <div aria-live="polite">
              {wrongPassphrase && (
                <p className="text-sm text-danger">{t("invite.wrongPassphrase")}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={unlocking || !passphrase.trim()}
                className="btn btn-primary flex-1"
              >
                {unlocking ? t("invite.unlocking") : t("invite.unlock")}
              </button>
              <button type="button" onClick={handleCancel} className="btn btn-ghost flex-1">
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}

        {status.type === "idle" && (
          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <h2 className="text-lg font-bold">
              {t("invite.joinTitle", { name: status.payload.profile.name })}
            </h2>
            <p className="text-sm text-text-muted">{t("invite.joinMessage")}</p>

            {status.exposesToken && (
              <p className="rounded-md border border-warning p-3 text-sm text-warning">
                {t("invite.legacyWarning")}
              </p>
            )}

            {needsToken && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-text-muted">
                  {t("invite.tokenHelp", { repo: repoName })}
                </p>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-text">{t("invite.token")}</span>
                  <input
                    type="password"
                    value={ownToken}
                    onChange={(e) => {
                      setOwnToken(e.target.value);
                      setTokenError(null);
                    }}
                    placeholder={t("settings.github.tokenPlaceholder")}
                    autoComplete="off"
                    aria-invalid={tokenError !== null}
                    className="field font-mono"
                  />
                </label>
                {tokenError && <p className="text-sm text-danger">{tokenError}</p>}
                <p className="text-xs break-all text-text-muted">
                  {t("invite.tokenDocs")}{" "}
                  <a
                    href={GITHUB_TOKEN_DOCS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline"
                  >
                    {GITHUB_TOKEN_DOCS_URL}
                  </a>
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={needsToken && !ownToken.trim()}
                className="btn btn-primary flex-1"
              >
                {t("invite.join")}
              </button>
              <button type="button" onClick={handleCancel} className="btn btn-ghost flex-1">
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}

        {status.type === "joining" && (
          <p className="text-sm text-text-muted">{t("invite.joining")}</p>
        )}

        {status.type === "joined" && (
          <>
            <p className="text-sm text-accent">{t("invite.joinSuccess")}</p>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm text-text-muted">
                {t("invite.instrumentQuestion")}
              </legend>
              <div className="flex flex-wrap gap-2">
                {INSTRUMENTS.map((inst) => (
                  <button
                    key={inst}
                    type="button"
                    onClick={() => setInstrument(inst)}
                    aria-pressed={instrument === inst}
                    className={[
                      "rounded-md border px-3 py-1.5 text-sm transition-colors",
                      instrument === inst
                        ? "border-accent bg-accent-muted text-accent"
                        : "border-border text-text-muted hover:border-text-faint hover:text-text",
                    ].join(" ")}
                  >
                    {t(`settings.instrument.${inst}`)}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSaveInstrument}
                className="btn btn-primary flex-1"
              >
                {t("common.save")}
              </button>
              <button
                type="button"
                onClick={() => setStatus(null)}
                className="btn btn-ghost flex-1"
              >
                {t("invite.skip")}
              </button>
            </div>
          </>
        )}

        {status.type === "error" && (
          <>
            <p className="text-sm text-danger">
              {t("invite.joinFailed", { error: status.message })}
            </p>
            <button
              type="button"
              onClick={() => setStatus(null)}
              className="btn btn-ghost self-end"
            >
              {t("common.close")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
