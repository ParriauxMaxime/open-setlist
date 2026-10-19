import type { ReactNode } from "react";

interface CardProps {
  title?: ReactNode;
  description?: string;
  /** Right side of the title line: a status badge, a button. */
  aside?: ReactNode;
  danger?: boolean;
  children: ReactNode;
}

/** A bordered block of related rows, like a block of system settings. */
export function Card({ title, description, aside, danger, children }: CardProps) {
  return (
    <section className="mb-6">
      {(title || aside) && (
        <div className="mb-1 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text">{title}</h3>
          {aside}
        </div>
      )}
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

interface CardRowProps {
  label: ReactNode;
  description?: string;
  /** Control under the label on every screen: sliders, wide pickers. */
  stacked?: boolean;
  children?: ReactNode;
}

/** Label and help text on the left, the control on the right. */
export function CardRow({ label, description, stacked, children }: CardRowProps) {
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
      {children && (
        <div className={stacked ? "" : "flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"}>
          {children}
        </div>
      )}
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

interface DisclosureProps {
  summary: ReactNode;
  defaultOpen?: boolean;
  /** `note`: the yellow of personal notes. */
  tone?: "default" | "note";
  className?: string;
  children: ReactNode;
}

/** A card folded under a one-line summary, for what is set once or rarely. */
export function Disclosure({
  summary,
  defaultOpen,
  tone = "default",
  className = "",
  children,
}: DisclosureProps) {
  const border = tone === "note" ? "border-note-border" : "border-border";
  const background = tone === "note" ? "bg-note-bg" : "bg-bg-surface";
  return (
    <details
      open={defaultOpen || undefined}
      className={`accordion group rounded-lg border ${border} ${background} ${className}`}
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-medium">
        {summary}
      </summary>
      <div className="accordion-content">
        <div className="accordion-inner">
          <div className={`border-t px-4 py-3 ${border}`}>{children}</div>
        </div>
      </div>
    </details>
  );
}

interface BadgeProps {
  tone?: "accent" | "muted" | "success" | "warning" | "danger";
  children: ReactNode;
}

/** A small pill of state: connected, active, pending. */
export function Badge({ tone = "accent", children }: BadgeProps) {
  const tones = {
    accent: "bg-accent-muted text-accent",
    muted: "bg-bg-hover text-text-muted",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/15 text-danger",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
