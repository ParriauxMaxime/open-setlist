import {
  buildInviteUrl,
  encodeOpenInvite,
  INVITE_PROTECTION,
  INVITE_PROTECTIONS,
  type InvitePayload,
  type InviteProtection,
  sealInvite,
} from "@domain/invite";
import {
  generatePassphrase,
  MIN_PASSPHRASE_LENGTH,
  normalizePassphrase,
} from "@domain/invite-passphrase";
import { loadProfiles } from "@domain/profiles";
import { loadSyncConfig } from "@domain/sync/config";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

const OPTION_KEYS: Record<InviteProtection, { label: string; desc: string }> = {
  [INVITE_PROTECTION.passphrase]: {
    label: "invite.passphraseOption",
    desc: "invite.passphraseOptionDesc",
  },
  [INVITE_PROTECTION.ownToken]: {
    label: "invite.ownTokenOption",
    desc: "invite.ownTokenOptionDesc",
  },
};

interface GitHubInvitePanelProps {
  profileId: string;
}

/** Passphrase is kept in component state only, gone when the panel closes. */
export function GitHubInvitePanel({ profileId }: GitHubInvitePanelProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("fr") ? "fr" : "en";
  const fieldId = useId();

  const [protection, setProtection] = useState<InviteProtection>(INVITE_PROTECTION.passphrase);
  const [passphrase, setPassphrase] = useState(() => generatePassphrase(locale));
  const [link, setLink] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const withPassphrase = protection === INVITE_PROTECTION.passphrase;
  const tooShort = normalizePassphrase(passphrase).length < MIN_PASSPHRASE_LENGTH;

  const reset = () => {
    setLink(null);
    setFeedback(null);
    setError(null);
  };

  const handleCreate = async () => {
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

    setCreating(true);
    reset();
    try {
      const encoded = withPassphrase
        ? await sealInvite(payload, passphrase)
        : encodeOpenInvite(payload);
      setLink(buildInviteUrl(encoded));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  // Copy and share run in their own click so the browser still sees a user
  // gesture (Safari drops it after the async encryption).
  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setError(null);
      setFeedback(t("invite.linkCopied"));
    } catch {
      setError(t("invite.shareFailed"));
    }
  };

  const handleShare = async () => {
    if (!link) return;
    try {
      await navigator.share({ url: link });
    } catch {
      // User cancelled the share sheet
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-bg-surface p-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-text">{t("invite.accessLegend")}</legend>
        {INVITE_PROTECTIONS.map((option) => (
          <label key={option} className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name={`${fieldId}-protection`}
              value={option}
              checked={protection === option}
              onChange={() => {
                setProtection(option);
                reset();
              }}
              className="mt-1"
            />
            <span className="flex flex-col">
              <span className="text-sm text-text">{t(OPTION_KEYS[option].label)}</span>
              <span className="text-xs text-text-muted">{t(OPTION_KEYS[option].desc)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {withPassphrase && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${fieldId}-passphrase`} className="text-sm text-text">
            {t("invite.passphrase")}
          </label>
          <div className="flex gap-2">
            <input
              id={`${fieldId}-passphrase`}
              type="text"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
                reset();
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby={`${fieldId}-hint`}
              aria-invalid={tooShort}
              className="field flex-1 font-mono"
            />
            <button
              type="button"
              onClick={() => {
                setPassphrase(generatePassphrase(locale));
                reset();
              }}
              className="btn btn-ghost text-xs"
            >
              {t("invite.suggestPassphrase")}
            </button>
          </div>
          <span
            id={`${fieldId}-hint`}
            className={`text-xs ${tooShort ? "text-danger" : "text-text-muted"}`}
          >
            {tooShort
              ? t("invite.passphraseTooShort", { count: MIN_PASSPHRASE_LENGTH })
              : t("invite.passphraseHint")}
          </span>
        </div>
      )}

      {!link && (
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating || (withPassphrase && tooShort)}
          className="btn btn-primary self-start"
        >
          {creating ? t("invite.creatingLink") : t("invite.createLink")}
        </button>
      )}

      {link && (
        <div className="flex flex-col gap-2">
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
            <button type="button" onClick={handleCopy} className="btn btn-primary">
              {t("invite.copyLink")}
            </button>
            {typeof navigator.share === "function" && (
              <button type="button" onClick={handleShare} className="btn btn-outline">
                {t("invite.share")}
              </button>
            )}
          </div>
          <p className="text-sm text-warning">
            {withPassphrase
              ? t("invite.sharePassphrase", { passphrase: normalizePassphrase(passphrase) })
              : t("invite.ownTokenReminder")}
          </p>
        </div>
      )}

      <div aria-live="polite">
        {feedback && <p className="text-sm text-accent">{feedback}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
