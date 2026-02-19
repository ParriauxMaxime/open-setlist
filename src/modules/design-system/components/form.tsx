import { type ComponentProps, forwardRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/* ─── Zod message → i18n key mapping ───────────────────────────── */

const ZOD_KEYS: Record<string, string> = {
  "Title is required": "validation.titleRequired",
  "Set name is required": "validation.setNameRequired",
  "Name is required": "validation.nameRequired",
};

/* ─── Field ─────────────────────────────────────────────────────── */

interface FieldProps {
  label: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, error, children }: FieldProps) {
  const { t } = useTranslation();
  const translated = error ? t(ZOD_KEYS[error] ?? error) : undefined;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-text-muted">{label}</span>
      {children}
      {translated && <span className="text-xs text-danger">{translated}</span>}
    </div>
  );
}

/* ─── Input ─────────────────────────────────────────────────────── */

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={className ? `field ${className}` : "field"} {...props} />
  ),
);

/* ─── Select ────────────────────────────────────────────────────── */

export const Select = forwardRef<HTMLSelectElement, ComponentProps<"select">>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={className ? `field ${className}` : "field"} {...props} />
  ),
);

/* ─── Textarea ──────────────────────────────────────────────────── */

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={className ? `field ${className}` : "field"} {...props} />
  ),
);
