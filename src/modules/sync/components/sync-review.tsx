import {
  type ChangeItem,
  type ConflictSide,
  itemKey,
  type SyncConflict,
  type SyncDiff,
} from "@domain/sync/diff";
import type { ConflictResolution, ConflictResolutions } from "@domain/sync/merge";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

interface SyncReviewProps {
  diff: SyncDiff;
  onConfirm: (selectedOutgoing: ChangeItem[], resolutions: ConflictResolutions) => void;
  onCancel: () => void;
  busy: boolean;
  /** Shown above the lists, e.g. when the remote moved during a push and the review was refreshed. */
  notice?: string;
}

const CHANGE_ICONS: Record<ChangeItem["change"], string> = {
  added: "+",
  modified: "~",
  deleted: "-",
};

const CHANGE_COLORS: Record<ChangeItem["change"], string> = {
  added: "text-accent",
  modified: "text-warning",
  deleted: "text-danger",
};

export function SyncReview({ diff, onConfirm, onCancel, busy, notice }: SyncReviewProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(diff.outgoing.map((c) => `${c.type}:${c.id}`)),
  );
  // No default: picking a side for someone would silently drop the other version.
  const [resolutions, setResolutions] = useState<ConflictResolutions>({});

  const toggle = useCallback((item: ChangeItem) => {
    const key = `${item.type}:${item.id}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelected(new Set(diff.outgoing.map((c) => `${c.type}:${c.id}`)));
      } else {
        setSelected(new Set());
      }
    },
    [diff.outgoing],
  );

  const resolve = useCallback((key: string, resolution: ConflictResolution) => {
    setResolutions((prev) => ({ ...prev, [key]: resolution }));
  }, []);

  const handleConfirm = useCallback(() => {
    const items = diff.outgoing.filter((c) => selected.has(`${c.type}:${c.id}`));
    onConfirm(items, resolutions);
  }, [diff.outgoing, selected, resolutions, onConfirm]);

  const allSelected = selected.size === diff.outgoing.length;
  const noneSelected = selected.size === 0;
  const unresolvedCount = diff.conflicts.filter((c) => !resolutions[itemKey(c.type, c.id)]).length;
  const hasConflicts = diff.conflicts.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {notice && <p className="text-sm text-warning">{notice}</p>}

      {/* Conflicts: changed on both sides, user must pick */}
      {hasConflicts && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-warning">
            {t("syncConflicts.title", { count: diff.conflicts.length })}
          </h3>
          <p className="mb-2 text-xs text-text-muted">{t("syncConflicts.description")}</p>
          <ul className="flex flex-col gap-2">
            {diff.conflicts.map((conflict) => {
              const key = itemKey(conflict.type, conflict.id);
              return (
                <ConflictRow
                  key={key}
                  conflict={conflict}
                  resolution={resolutions[key]}
                  onResolve={(resolution) => resolve(key, resolution)}
                />
              );
            })}
          </ul>
        </section>
      )}

      {/* Incoming changes */}
      {diff.incoming.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-text-muted">
            Incoming ({diff.incoming.length})
          </h3>
          <ul className="flex flex-col gap-1">
            {diff.incoming.map((item) => (
              <li
                key={`${item.type}:${item.id}`}
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
              >
                <span className={`w-4 text-center font-mono ${CHANGE_COLORS[item.change]}`}>
                  {CHANGE_ICONS[item.change]}
                </span>
                <span className="flex-1 truncate">{item.name}</span>
                <span className="text-xs text-text-faint">{item.type}</span>
                <span className={`text-xs ${CHANGE_COLORS[item.change]}`}>{item.change}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Outgoing changes */}
      {diff.outgoing.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-muted">
              Outgoing ({selected.size}/{diff.outgoing.length})
            </h3>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => toggleAll(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-[var(--color-accent)]"
              />
              Select all
            </label>
          </div>
          <ul className="flex flex-col gap-1">
            {diff.outgoing.map((item) => {
              const key = `${item.type}:${item.id}`;
              const checked = selected.has(key);
              return (
                <li key={key}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-bg-hover">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(item)}
                      className="h-4 w-4 rounded accent-[var(--color-accent)]"
                    />
                    <span className={`w-4 text-center font-mono ${CHANGE_COLORS[item.change]}`}>
                      {CHANGE_ICONS[item.change]}
                    </span>
                    <span className="flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-text-faint">{item.type}</span>
                    <span className={`text-xs ${CHANGE_COLORS[item.change]}`}>{item.change}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* No changes */}
      {diff.incoming.length === 0 && diff.outgoing.length === 0 && !hasConflicts && (
        <p className="text-sm text-text-muted">Everything is up to date.</p>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        {unresolvedCount > 0 && (
          <p className="text-xs text-warning">
            {t("syncConflicts.unresolved", { count: unresolvedCount })}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={
              busy ||
              unresolvedCount > 0 ||
              (diff.outgoing.length > 0 &&
                noneSelected &&
                diff.incoming.length === 0 &&
                !hasConflicts)
            }
            className="btn btn-primary"
          >
            {busy
              ? "Syncing..."
              : noneSelected && (diff.incoming.length > 0 || hasConflicts)
                ? "Pull Incoming"
                : `Sync ${selected.size > 0 ? `(${selected.size})` : ""}`}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConflictRowProps {
  conflict: SyncConflict;
  resolution: ConflictResolution | undefined;
  onResolve: (resolution: ConflictResolution) => void;
}

function ConflictRow({ conflict, resolution, onResolve }: ConflictRowProps) {
  const { t } = useTranslation();
  const bothPresent = !conflict.local.deleted && !conflict.remote.deleted;

  return (
    <li className="rounded-sm border border-border px-3 py-2 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="w-4 text-center font-mono text-warning">!</span>
        <span className="flex-1 truncate font-medium">{conflict.name}</span>
        <span className="text-xs text-text-faint">{conflict.type}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ConflictSideOption
          label={t("syncConflicts.mine")}
          action={t("syncConflicts.keepMine")}
          side={conflict.local}
          type={conflict.type}
          checked={resolution === "mine"}
          onSelect={() => onResolve("mine")}
          name={`conflict-${conflict.type}-${conflict.id}`}
        />
        <ConflictSideOption
          label={t("syncConflicts.theirs")}
          action={t("syncConflicts.takeTheirs")}
          side={conflict.remote}
          type={conflict.type}
          checked={resolution === "theirs"}
          onSelect={() => onResolve("theirs")}
          name={`conflict-${conflict.type}-${conflict.id}`}
        />
      </div>

      {bothPresent && (
        <div className="mt-2 flex flex-col gap-0.5 text-xs text-text-faint">
          {conflict.changedFields.length > 0 && (
            <span>
              {t("syncConflicts.changedFields", { fields: conflict.changedFields.join(", ") })}
            </span>
          )}
          {(conflict.onlyLocal > 0 || conflict.onlyRemote > 0) && (
            <span>
              {t(conflict.type === "song" ? "syncConflicts.linesDiff" : "syncConflicts.songsDiff", {
                mine: conflict.onlyLocal,
                theirs: conflict.onlyRemote,
              })}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

interface ConflictSideOptionProps {
  label: string;
  action: string;
  side: ConflictSide;
  type: SyncConflict["type"];
  checked: boolean;
  onSelect: () => void;
  name: string;
}

function ConflictSideOption({
  label,
  action,
  side,
  type,
  checked,
  onSelect,
  name,
}: ConflictSideOptionProps) {
  const { t, i18n } = useTranslation();
  const date = side.at ? new Date(side.at).toLocaleString(i18n.language) : null;

  return (
    <label
      className={`flex cursor-pointer flex-col gap-0.5 rounded-sm border px-2 py-1.5 hover:bg-bg-hover ${
        checked ? "border-accent" : "border-border"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onSelect}
          className="h-4 w-4 accent-[var(--color-accent)]"
        />
        <span className="font-medium">{action}</span>
      </span>
      <span className="text-xs text-text-muted">
        {label}
        {side.name && !side.deleted ? ` · ${side.name}` : ""}
      </span>
      {side.deleted ? (
        <span className="text-xs text-danger">
          {date ? t("syncConflicts.deletedOn", { date }) : t("syncConflicts.deleted")}
        </span>
      ) : (
        <span className="text-xs text-text-faint">
          {date && t("syncConflicts.edited", { date })}
          {side.size !== null &&
            ` · ${t(type === "song" ? "syncConflicts.lines" : "syncConflicts.songs", { count: side.size })}`}
        </span>
      )}
    </label>
  );
}
