import { createId } from "@domain/id";
import { clearMyNotes } from "@domain/my-notes";
import {
  addProfile,
  type Profile,
  removeProfile,
  setActiveProfileId,
  updateProfile,
  useActiveProfileId,
  useProfiles,
} from "@domain/profiles";
import { loadSyncConfig } from "@domain/sync/config";
import Dexie from "dexie";
import type { TFunction } from "i18next";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Card } from "../../design-system/components/card";
import { ConfirmModal } from "../../design-system/components/confirm-modal";

const AVATAR_PRESETS = [
  "\u{1F3B8}",
  "\u{1F3B9}",
  "\u{1F941}",
  "\u{1F3A4}",
  "\u{1F3B5}",
  "\u{1F3B6}",
  "\u{1F3BC}",
  "\u{1F3A7}",
];

export function ProfileManager() {
  const { t } = useTranslation();
  const profiles = useProfiles();
  const activeId = useActiveProfileId();

  const handleAdd = useCallback(() => {
    const id = createId();
    addProfile({ id, name: t("settings.profile.newName"), createdAt: Date.now() });
    setActiveProfileId(id);
  }, [t]);

  return (
    <Card>
      {profiles.map((p) => (
        <ProfileRow
          key={p.id}
          profile={p}
          isActive={p.id === activeId}
          canDelete={profiles.length > 1}
        />
      ))}
      <div className="px-4 py-3">
        <button type="button" onClick={handleAdd} className="link-accent text-sm">
          {t("settings.profile.add")}
        </button>
      </div>
    </Card>
  );
}

function syncLabel(profileId: string, t: TFunction): string {
  const config = loadSyncConfig(profileId);
  if (config?.adapter === "github") {
    return t("settings.profile.syncGitHub", { repo: `${config.owner}/${config.repo}` });
  }
  if (config?.adapter === "google-drive") return t("settings.profile.syncGoogleDrive");
  return t("settings.profile.syncNone");
}

function ProfileRow({
  profile,
  isActive,
  canDelete,
}: {
  profile: Profile;
  isActive: boolean;
  canDelete: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = useCallback(() => {
    updateProfile(profile.id, { name: name.trim() || profile.name, avatar: avatar || undefined });
    setEditing(false);
  }, [profile.id, profile.name, name, avatar]);

  const handleDelete = useCallback(() => {
    Dexie.delete(`open-setlist-${profile.id}`);
    localStorage.removeItem(`open-setlist-sync-config-${profile.id}`);
    localStorage.removeItem(`open-setlist-tombstones-${profile.id}`);
    clearMyNotes(profile.id);
    removeProfile(profile.id);
    setConfirmDelete(false);
  }, [profile.id]);

  if (editing) {
    return (
      <div className="flex flex-col gap-3 px-4 py-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field text-sm"
          placeholder={t("settings.profile.name")}
          aria-label={t("settings.profile.name")}
        />
        <div>
          <p className="mb-1 text-xs text-text-muted">{t("settings.profile.avatar")}</p>
          <div className="flex flex-wrap gap-1">
            {AVATAR_PRESETS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setAvatar(emoji)}
                aria-pressed={avatar === emoji}
                className={[
                  "flex h-8 w-8 items-center justify-center rounded-md border text-lg transition-colors",
                  avatar === emoji
                    ? "border-accent bg-accent-muted"
                    : "border-border hover:border-text-faint",
                ].join(" ")}
              >
                {emoji}
              </button>
            ))}
            <input
              type="text"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value.slice(0, 2))}
              className="field w-12 text-center text-sm"
              placeholder="..."
              maxLength={2}
              aria-label={t("settings.profile.avatar")}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleSave} className="btn btn-primary btn-sm">
            {t("common.save")}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost btn-sm">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-hover text-lg">
        {profile.avatar ?? profile.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-text">{profile.name}</span>
          {isActive && <Badge>{t("settings.profile.active")}</Badge>}
        </div>
        <p className="text-xs text-text-faint">{syncLabel(profile.id, t)}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        {!isActive && (
          <button
            type="button"
            onClick={() => setActiveProfileId(profile.id)}
            className="btn btn-ghost btn-sm text-xs"
          >
            {t("settings.profile.use")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="btn btn-ghost btn-sm text-xs"
        >
          {t("settings.profile.edit")}
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="btn btn-ghost btn-sm text-xs text-danger"
          >
            {t("common.delete")}
          </button>
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title={t("settings.profile.deleteConfirmTitle")}
          message={t("settings.profile.deleteConfirmMessage")}
          confirmLabel={t("common.delete")}
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
