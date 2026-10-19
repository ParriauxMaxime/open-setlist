import type { ReactNode } from "react";

interface SettingsGroupProps {
  title?: string;
  description?: string;
  danger?: boolean;
  children: ReactNode;
}

/** A card of related rows, like a block of macOS System Settings. */
export function SettingsGroup({ title, description, danger, children }: SettingsGroupProps) {
  return (
    <section className="mb-6">
      {title && <h3 className="mb-1 text-sm font-semibold text-text">{title}</h3>}
      {description && <p className="mb-2 text-xs text-text-muted">{description}</p>}
      <div
        className={[
          "divide-y divide-border rounded-lg border bg-bg-surface",
          danger ? "border-danger/40" : "border-border",
        ].join(" ")}
      >
        {children}
      </div>
    </section>
  );
}

interface SettingRowProps {
  label: string;
  description?: string;
  /** Control under the label on every screen: sliders, wide pickers. */
  stacked?: boolean;
  children: ReactNode;
}

/** Label and help text on the left, the control on the right. */
export function SettingRow({ label, description, stacked, children }: SettingRowProps) {
  return (
    <div
      className={[
        "flex gap-3 px-4 py-3",
        stacked ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:justify-between",
      ].join(" ")}
    >
      <div className="min-w-0">
        <div className="text-sm text-text">{label}</div>
        {description && <p className="mt-0.5 text-xs text-text-faint">{description}</p>}
      </div>
      <div className={stacked ? "" : "flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"}>
        {children}
      </div>
    </div>
  );
}

interface ChoiceProps {
  selected: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}

/** One option of a segmented choice: language, color scheme, instrument. */
export function Choice({ selected, onClick, title, children }: ChoiceProps) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={selected}
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
        selected
          ? "border-accent bg-accent-muted text-accent"
          : "border-border text-text-muted hover:border-text-faint hover:text-text",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A row whose whole surface flips one checkbox. */
export function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm text-text">{label}</div>
        {description && <p className="mt-0.5 text-xs text-text-faint">{description}</p>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 rounded accent-[var(--color-accent)]"
      />
    </label>
  );
}
