import type { ChangeItem, SyncDiff } from "@domain/sync/diff";
import { useCallback, useState } from "react";

interface SyncReviewProps {
  diff: SyncDiff;
  onConfirm: (selectedOutgoing: ChangeItem[]) => void;
  onCancel: () => void;
  busy: boolean;
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

export function SyncReview({ diff, onConfirm, onCancel, busy }: SyncReviewProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(diff.outgoing.map((c) => `${c.type}:${c.id}`)),
  );

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

  const handleConfirm = useCallback(() => {
    const items = diff.outgoing.filter((c) => selected.has(`${c.type}:${c.id}`));
    onConfirm(items);
  }, [diff.outgoing, selected, onConfirm]);

  const allSelected = selected.size === diff.outgoing.length;
  const noneSelected = selected.size === 0;

  return (
    <div className="flex flex-col gap-4">
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
      {diff.incoming.length === 0 && diff.outgoing.length === 0 && (
        <p className="text-sm text-text-muted">Everything is up to date.</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={
            busy || (diff.outgoing.length > 0 && noneSelected && diff.incoming.length === 0)
          }
          className="btn btn-primary"
        >
          {busy
            ? "Syncing..."
            : noneSelected && diff.incoming.length > 0
              ? "Pull Incoming"
              : `Sync ${selected.size > 0 ? `(${selected.size})` : ""}`}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="btn btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}
