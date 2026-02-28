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
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
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
    const id = crypto.randomUUID();
    addProfile({ id, name: t("settings.profile.newName"), createdAt: Date.now() });
    setActiveProfileId(id);
  }, [t]);

  return (
    <div className="flex flex-col gap-3">
      {profiles.map((p) => (
        <ProfileRow
          key={p.id}
          profile={p}
          isActive={p.id === activeId}
          canDelete={profiles.length > 1}
        />
      ))}
      <button type="button" onClick={handleAdd} className="link-accent text-sm">
        {t("settings.profile.add")}
      </button>
    </div>
  );
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

  const syncConfig = loadSyncConfig(profile.id);
  const syncLabel =
    syncConfig?.adapter === "github"
      ? `GitHub: ${syncConfig.owner}/${syncConfig.repo}`
      : "Not configured";

  const handleSave = useCallback(() => {
    updateProfile(profile.id, { name: name.trim() || profile.name, avatar: avatar || undefined });
    setEditing(false);
  }, [profile.id, profile.name, name, avatar]);

  const handleDelete = useCallback(() => {
    // Delete profile-keyed Dexie database
    Dexie.delete(`open-setlist-${profile.id}`);
    // Remove profile-keyed localStorage entries
    localStorage.removeItem(`open-setlist-sync-config-${profile.id}`);
    localStorage.removeItem(`open-setlist-tombstones-${profile.id}`);
    removeProfile(profile.id);
    setConfirmDelete(false);
  }, [profile.id]);

  if (editing) {
    return (
      <div className="rounded-md border border-border bg-bg-surface p-3">
        <div className="mb-3 flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field flex-1 text-sm"
            placeholder="Profile name"
          />
        </div>
        <div className="mb-3">
          <p className="mb-1 text-xs text-text-muted">Avatar</p>
          <div className="flex flex-wrap gap-1">
            {AVATAR_PRESETS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setAvatar(emoji)}
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
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleSave} className="btn btn-primary btn-sm">
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost btn-sm">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-bg-surface px-3 py-2">
      <span className="text-lg">{profile.avatar ?? profile.name.slice(0, 1).toUpperCase()}</span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text">{profile.name}</span>
          {isActive && (
            <span className="rounded-full bg-accent-muted px-1.5 py-0.5 text-xs text-accent">
              Active
            </span>
          )}
        </div>
        <p className="text-xs text-text-faint">Sync: {syncLabel}</p>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="btn btn-ghost btn-sm text-xs"
        >
          Edit
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="btn btn-ghost btn-sm text-xs text-danger"
          >
            Delete
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
