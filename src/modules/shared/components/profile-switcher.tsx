import {
  addProfile,
  type Profile,
  setActiveProfileId,
  useActiveProfileId,
  useProfiles,
} from "@domain/profiles";
import { useCallback, useEffect, useRef, useState } from "react";

export function ProfileSwitcher() {
  const profiles = useProfiles();
  const activeId = useActiveProfileId();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const active = profiles.find((p) => p.id === activeId);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const switchProfile = useCallback(
    (id: string) => {
      if (id === activeId) return;
      setActiveProfileId(id);
      setOpen(false);
    },
    [activeId],
  );

  const handleCreate = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    const profile: Profile = {
      id,
      name,
      avatar: name.slice(0, 1).toUpperCase(),
      createdAt: Date.now(),
    };
    addProfile(profile);
    setActiveProfileId(id);
    setNewName("");
    setCreating(false);
    setOpen(false);
  }, [newName]);

  return (
    <div ref={menuRef} className="relative mb-2">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-bg-hover"
      >
        <span className="text-lg">{active?.avatar ?? "\u{1F3B5}"}</span>
        <span className="flex-1 truncate text-sm font-bold text-text">
          {active?.name ?? "Profile"}
        </span>
        <span className="text-xs text-text-faint">{open ? "\u25B4" : "\u25BE"}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-md border border-border bg-bg-surface shadow-lg">
          {/* Profile list */}
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => switchProfile(p.id)}
              className={[
                "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                p.id === activeId ? "bg-accent-muted text-accent" : "text-text hover:bg-bg-hover",
              ].join(" ")}
            >
              <span className="text-lg">{p.avatar ?? p.name.slice(0, 1).toUpperCase()}</span>
              <span className="flex-1 truncate">{p.name}</span>
              {p.id === activeId && <span className="text-accent">{"\u2713"}</span>}
            </button>
          ))}

          <div className="border-t border-border" />

          {/* Create new */}
          {creating ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate();
              }}
              className="flex items-center gap-2 px-3 py-2"
            >
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Profile name"
                className="field flex-1 text-sm"
                // biome-ignore lint/a11y/noAutofocus: focus the input when creating a new profile
                autoFocus
              />
              <button type="submit" className="text-sm font-medium text-accent">
                Add
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-text-muted hover:bg-bg-hover"
            >
              <span className="text-lg">+</span>
              <span>New Profile</span>
            </button>
          )}

          <div className="border-t border-border px-3 py-1.5">
            <p className="text-xs text-text-faint">
              Each profile has its own songs, setlists & sync
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
