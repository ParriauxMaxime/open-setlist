import { searchNotes } from "@domain/midi/note-options";
import { noteName } from "@domain/midi/patch";
import { type KeyboardEvent, useId, useState } from "react";
import { Input } from "../../design-system/components/form";

const VISIBLE = 12;

interface MidiNotePickerProps {
  /** The MIDI number as text, "60"; anything else is kept as typed. */
  value: string;
  onChange: (value: string) => void;
  "aria-label": string;
  "aria-invalid"?: boolean;
  className?: string;
}

/**
 * A number from 0 to 127 picked as Live shows it: type "6" or "c3", pick "60 · C3".
 * Stores the number only, so the field keeps working as a plain code elsewhere.
 */
export function MidiNotePicker({ value, onChange, className, ...aria }: MidiNotePickerProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const options = searchNotes(value, VISIBLE);
  const picked = /^\d{1,3}$/.test(value.trim()) && Number(value) <= 127;

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && options[active]) {
      e.preventDefault();
      choose(options[active].value);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={`relative flex items-center gap-2 ${className ?? ""}`}>
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder="60"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className="max-w-24"
        {...aria}
      />
      {picked && <span className="text-xs text-text-faint">{noteName(Number(value))}</span>}
      {open && options.length > 0 && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-64 w-36 overflow-y-auto rounded-md border border-border bg-bg-surface py-1 shadow-lg"
        >
          {options.map((option, i) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(option.value)}
              className={`flex w-full items-baseline justify-between px-3 py-1.5 text-left text-sm text-text hover:bg-bg-hover ${
                i === active ? "bg-bg-hover" : ""
              }`}
            >
              <span>{option.value}</span>
              <span className="text-text-muted">{option.note}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
