import { useEffect } from "react";
import { useFocusTrap } from "../../shared/hooks/use-focus-trap";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Escape, when it should not mean the cancel button (both buttons go ahead). */
  onDismiss?: () => void;
  variant?: "danger" | "default";
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  onDismiss,
  variant = "default",
}: ConfirmModalProps) {
  const trapRef = useFocusTrap(true);
  const dismiss = onDismiss ?? onCancel;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [dismiss]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-bg p-6 shadow-xl"
      >
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-text-muted">{message}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className={`btn flex-1 ${variant === "danger" ? "btn-danger" : "btn-primary"}`}
          >
            {confirmLabel}
          </button>
          <button type="button" onClick={onCancel} className="btn btn-ghost flex-1">
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
