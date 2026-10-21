import { type ReactNode, useEffect, useRef, useState } from "react";

export interface ToolbarMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Shown as a tooltip, typically why the item is disabled. */
  title?: string;
  /** Destructive: drawn in red, after a separator. */
  danger?: boolean;
}

interface ToolbarMenuProps {
  label: string;
  items: ToolbarMenuItem[];
  /** What the button shows; ⋮ by default. */
  trigger?: ReactNode;
  triggerClassName?: string;
  /** Which edge of the button the list hangs from. */
  align?: "left" | "right";
  /** Keeps the focus where it is (a text field) while the menu is used. */
  keepFocus?: boolean;
}

/** The ⋮ menu of a toolbar: closes on a pick, a click outside or Escape. */
export function ToolbarMenu({
  label,
  items,
  trigger = <>&#8942;</>,
  triggerClassName = "btn btn-ghost btn-responsive",
  align = "right",
  keepFocus = false,
}: ToolbarMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const holdFocus = keepFocus ? (e: React.PointerEvent) => e.preventDefault() : undefined;
  const plain = items.filter((item) => !item.danger);
  const danger = items.filter((item) => item.danger);
  const render = (item: ToolbarMenuItem) => (
    <button
      key={item.label}
      type="button"
      disabled={item.disabled}
      title={item.title}
      onPointerDown={holdFocus}
      onClick={() => {
        setOpen(false);
        item.onClick();
      }}
      className={`block w-full px-4 py-2 text-left text-sm hover:bg-bg-hover disabled:opacity-50 ${
        item.danger ? "text-danger" : "text-text"
      }`}
    >
      {item.label}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onPointerDown={holdFocus}
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {trigger}
      </button>
      {open && (
        <div
          className={`absolute top-full z-50 mt-1 min-w-44 rounded-md border border-border bg-bg-surface py-1 shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
        >
          {plain.map(render)}
          {danger.length > 0 && plain.length > 0 && <div className="my-1 border-t border-border" />}
          {danger.map(render)}
        </div>
      )}
    </div>
  );
}
