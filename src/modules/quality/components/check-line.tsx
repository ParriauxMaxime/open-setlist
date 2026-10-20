import type { ReactNode } from "react";

interface CheckLineProps {
  passed: boolean;
  label: string;
  aside?: ReactNode;
}

/** "+ Has key" or "- Has key", one line of a quality card. */
export function CheckLine({ passed, label, aside }: CheckLineProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm">
      <span className={passed ? "text-success" : "text-danger"}>{passed ? "+" : "-"}</span>
      <span className={passed ? "text-text" : "text-text-muted"}>{label}</span>
      {aside && <span className="ml-auto shrink-0 text-xs text-text-faint">{aside}</span>}
    </div>
  );
}
