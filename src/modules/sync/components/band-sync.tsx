import { formatTimeAgo } from "@domain/format";
import { buildBandInviteUrl, openBandInvite, parseBandInput } from "@domain/invite";
import { updateProfile, useActiveProfileId, useProfiles } from "@domain/profiles";
import {
  createBand,
  createRelayAdapter,
  isRelayAvailable,
  RelayError,
} from "@domain/sync/adapters/relay";
import { formatBandCode, generateBandCode } from "@domain/sync/band-code";
import { clearSyncConfig, loadSyncConfig, saveSyncConfig } from "@domain/sync/config";
import type { TranspositionMismatch } from "@domain/sync/transposition-mismatch";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmModal } from "../../design-system/components/confirm-modal";
import { useRemoteSync } from "../hooks/use-remote-sync";
import { SyncReview } from "./sync-review";

const REMOTE_NAMES = { github: "GitHub", "google-drive": "Google Drive" } as const;

type Panel = "create" | "join" | "invite" | null;

interface BandSyncProps {
  onTranspositionMismatches: (mismatches: TranspositionMismatch[]) => void;
}

/** Simple sync: create a band or join one with its code, then sync through the relay. */
export function BandSync({ onTranspositionMismatches }: BandSyncProps) {
  const { t } = useTranslation();
  const profileId = useActiveProfileId();
  const profile = useProfiles().find((p) => p.id === profileId);
  const fieldId = useId();

  const [panel, setPanel] = useState<Panel>(null);
  const [bandName, setBandName] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const describeError = (err: unknown) =>
    err instanceof RelayError
      ? t(`sync.band.errors.${err.kind}`)
      : err instanceof Error
        ? err.message
        : String(err);

  const sync = useRemoteSync({
    createAdapter: () => {
      const config = loadSyncConfig(profileId);
      return config?.adapter === "relay" ? createRelayAdapter(config) : null;
    },
    describeError,
    onTranspositionMismatches,
  });
  const { status } = sync;

  const config = loadSyncConfig(profileId);
  const band = config?.adapter === "relay" ? config : null;
  const otherRemote = config && config.adapter !== "relay" ? REMOTE_NAMES[config.adapter] : null;

  const togglePanel = (next: Panel) => {
    setPanel(panel === next ? null : next);
    setFormError(null);
    setFeedback(null);
    if (next === "create") setBandName(profile?.name ?? "");
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const name = bandName.trim();
    if (!name || creating) return;
    setCreating(true);
    setFormError(null);
    try {
      const code = generateBandCode();
      await createBand(code, { name, avatar: profile?.avatar });
      if (name !== profile?.name) updateProfile(profileId, { name });
      saveSyncConfig(profileId, {
        adapter: "relay",
        code,
        lastVersionToken: null,
        lastSyncedAt: null,
      });
      setPanel("invite");
      setFeedback(t("sync.band.created"));
      await sync.start();
    } catch (err) {
      setFormError(describeError(err));
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    const code = parseBandInput(joinInput);
    if (!code) {
      setFormError(t("sync.band.invalidCode"));
      return;
    }
    setJoinInput("");
    setPanel(null);
    openBandInvite(code);
  };

  const handleLeave = () => {
    clearSyncConfig(profileId);
    setConfirmLeave(false);
    setPanel(null);
    sync.reset();
  };

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(done);
    } catch {
      setFeedback(t("invite.shareFailed"));
    }
  };

  const handleShare = async (url: string) => {
    try {
      await navigator.share({ url });
    } catch {
      // User cancelled the share sheet
    }
  };

  if (!band) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("sync.band.heading")}</h2>
        <p className="text-sm text-text-muted">{t("sync.band.desc")}</p>

        {!isRelayAvailable() ? (
          <p className="rounded-md border border-warning p-3 text-sm text-warning">
            {t("sync.band.unavailable")}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => togglePanel("create")}
                disabled={Boolean(otherRemote) || profile?.isDemo}
                aria-expanded={panel === "create"}
                className="btn btn-primary"
              >
                {t("sync.band.create")}
              </button>
              <button
                type="button"
                onClick={() => togglePanel("join")}
                aria-expanded={panel === "join"}
                className="btn btn-outline"
              >
                {t("sync.band.join")}
              </button>
            </div>

            {otherRemote && (
              <p className="text-xs text-text-muted">
                {t("sync.band.otherRemote", { remote: otherRemote })}
              </p>
            )}
            {!otherRemote && profile?.isDemo && (
              <p className="text-xs text-text-muted">{t("sync.band.demoProfile")}</p>
            )}

            {panel === "create" && (
              <form
                onSubmit={handleCreate}
                className="flex flex-col gap-3 rounded-md border border-border bg-bg-surface p-3"
              >
                <p className="text-sm text-text-muted">{t("sync.band.createDesc")}</p>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-text">{t("sync.band.bandName")}</span>
                  <input
                    type="text"
                    value={bandName}
                    onChange={(e) => setBandName(e.target.value)}
                    className="field"
                    disabled={creating}
                  />
                </label>
                <button
                  type="submit"
                  disabled={creating || !bandName.trim()}
                  className="btn btn-primary self-start"
                >
                  {creating ? t("sync.band.creating") : t("sync.band.createConfirm")}
                </button>
              </form>
            )}

            {panel === "join" && (
              <form
                onSubmit={handleJoin}
                className="flex flex-col gap-3 rounded-md border border-border bg-bg-surface p-3"
              >
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-text">{t("sync.band.joinLabel")}</span>
                  <input
                    type="text"
                    value={joinInput}
                    onChange={(e) => {
                      setJoinInput(e.target.value);
                      setFormError(null);
                    }}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    aria-invalid={formError !== null}
                    className="field font-mono"
                  />
                </label>
                <button
                  type="submit"
                  disabled={!joinInput.trim()}
                  className="btn btn-primary self-start"
                >
                  {t("invite.join")}
                </button>
              </form>
            )}

            <div aria-live="polite">
              {formError && <p className="text-sm text-danger">{formError}</p>}
            </div>
          </>
        )}
      </section>
    );
  }

  const link = buildBandInviteUrl(band.code);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("sync.band.heading")}</h2>

      {status.type === "review" ? (
        <SyncReview
          key={`${status.ctx.versionToken}:${status.ctx.local.exportedAt}`}
          diff={status.ctx.diff}
          onConfirm={sync.confirm}
          onCancel={sync.reset}
          busy={false}
          notice={status.refreshed ? t("syncConflicts.reviewRefreshed") : undefined}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={sync.start}
              disabled={sync.busy || creating}
              className="btn btn-primary"
            >
              {status.type === "pulling"
                ? t("sync.band.pulling")
                : status.type === "pushing"
                  ? t("sync.band.pushing")
                  : t("sync.band.sync")}
            </button>
            <button
              type="button"
              onClick={() => togglePanel("invite")}
              aria-expanded={panel === "invite"}
              className="btn btn-outline"
            >
              {t("invite.inviteMembers")}
            </button>
            {band.lastSyncedAt && status.type === "idle" && (
              <span className="text-sm text-text-muted">
                {t("sync.github.lastSync", { time: formatTimeAgo(band.lastSyncedAt) })}
              </span>
            )}
          </div>

          <div aria-live="polite">
            {status.type === "success" && (
              <p className="text-sm text-accent">
                {status.result.status === "up-to-date"
                  ? t("sync.googleDrive.upToDate")
                  : t(
                      status.result.status === "created"
                        ? "sync.band.syncCreated"
                        : "sync.github.syncSuccess",
                      {
                        songs: status.result.songCount,
                        setlists: status.result.setlistCount,
                      },
                    )}
              </p>
            )}
            {status.type === "success" && status.files === "failed" && (
              <p className="text-sm text-warning">{t("sync.band.filesFailed")}</p>
            )}
            {status.type === "success" && status.files && status.files !== "failed" && (
              <>
                {status.files.uploaded + status.files.downloaded > 0 && (
                  <p className="text-sm text-accent">
                    {t("sync.band.filesSynced", {
                      sent: status.files.uploaded,
                      received: status.files.downloaded,
                    })}
                  </p>
                )}
                {status.files.tooLarge > 0 && (
                  <p className="text-sm text-warning">
                    {t("sync.band.filesTooLarge", { count: status.files.tooLarge })}
                  </p>
                )}
                {status.files.unavailable > 0 && (
                  <p className="text-sm text-text-muted">
                    {t("sync.band.filesUnavailable", { count: status.files.unavailable })}
                  </p>
                )}
              </>
            )}
            {status.type === "error" && (
              <p className="text-sm text-danger">
                {t("sync.github.syncFailed", { error: status.message })}
              </p>
            )}
          </div>
        </>
      )}

      {panel === "invite" && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-bg-surface p-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-text">{t("invite.link")}</span>
            <input
              type="text"
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="field font-mono text-xs"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copy(link, t("invite.linkCopied"))}
              className="btn btn-primary"
            >
              {t("invite.copyLink")}
            </button>
            {typeof navigator.share === "function" && (
              <button type="button" onClick={() => handleShare(link)} className="btn btn-outline">
                {t("invite.share")}
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span id={`${fieldId}-code`} className="text-sm text-text">
              {t("sync.band.code")}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <output
                aria-labelledby={`${fieldId}-code`}
                className="font-mono text-sm break-all select-all"
              >
                {formatBandCode(band.code)}
              </output>
              <button
                type="button"
                onClick={() => copy(formatBandCode(band.code), t("sync.band.codeCopied"))}
                className="btn btn-ghost btn-sm"
              >
                {t("sync.band.copyCode")}
              </button>
            </div>
          </div>
          <p className="text-sm text-warning">{t("sync.band.inviteHint")}</p>
          <div aria-live="polite">
            {feedback && <p className="text-sm text-accent">{feedback}</p>}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setConfirmLeave(true)}
        disabled={sync.busy || creating}
        className="btn btn-ghost self-start text-sm"
      >
        {t("sync.band.leave")}
      </button>

      {confirmLeave && (
        <ConfirmModal
          title={t("sync.band.leaveTitle")}
          message={t("sync.band.leaveMessage")}
          confirmLabel={t("sync.band.leave")}
          variant="danger"
          onConfirm={handleLeave}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </section>
  );
}
