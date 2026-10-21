import { applyChartInsert, type ChartInsert } from "@domain/chordpro/insert";
import type { SongFormValues } from "@domain/schemas/song";
import { type ReactNode, type RefCallback, useCallback, useEffect, useRef } from "react";
import type { UseFormRegister } from "react-hook-form";
import { ChartInsertBar } from "./chart-insert-bar";

/**
 * Tokenize a line of ChordPro into spans for syntax highlighting.
 *
 * Token types:
 * - directive: `{title: Foo}`
 * - chord:     `[Am7]`
 * - text:      everything else
 */
interface Token {
  type: "directive" | "chord" | "text";
  value: string;
}

export function tokenizeLine(line: string): Token[] {
  // Full-line directive
  if (/^\{[^}]*\}\s*$/.test(line)) {
    return [{ type: "directive", value: line }];
  }

  const tokens: Token[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    // Look for next chord bracket
    const chordIdx = remaining.indexOf("[");
    if (chordIdx === -1) {
      tokens.push({ type: "text", value: remaining });
      break;
    }

    // Text before the chord
    if (chordIdx > 0) {
      tokens.push({ type: "text", value: remaining.slice(0, chordIdx) });
    }

    const endIdx = remaining.indexOf("]", chordIdx);
    if (endIdx === -1) {
      // Unclosed bracket — treat rest as text
      tokens.push({ type: "text", value: remaining.slice(chordIdx) });
      break;
    }

    tokens.push({ type: "chord", value: remaining.slice(chordIdx, endIdx + 1) });
    remaining = remaining.slice(endIdx + 1);
  }

  return tokens;
}

function highlightContent(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      tokenizeLine(line)
        .map((t) => {
          const escaped = escapeHtml(t.value);
          switch (t.type) {
            case "directive":
              return `<span class="cphl-directive">${escaped}</span>`;
            case "chord":
              return `<span class="cphl-chord">${escaped}</span>`;
            default:
              return escaped;
          }
        })
        .join(""),
    )
    .join("\n");
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface ChordProEditorProps {
  register: UseFormRegister<SongFormValues>;
  /** Current content value — used to keep highlight layer in sync with programmatic changes. */
  value: string;
  error?: string;
  /** Actions shown above the editor (e.g. "Paste chart"). */
  toolbar?: ReactNode;
  /** Sets the content through the form, as a programmatic change (insert buttons). */
  onContentChange: (content: string) => void;
}

export function ChordProEditor({
  register,
  value,
  error,
  toolbar,
  onContentChange,
}: ChordProEditorProps) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Merge react-hook-form ref with our local ref
  const { ref: rhfRef, onChange, onBlur, name } = register("content");
  const mergedRef: RefCallback<HTMLTextAreaElement> = useCallback(
    (el: HTMLTextAreaElement | null) => {
      rhfRef(el);
      textareaRef.current = el;
    },
    [rhfRef],
  );

  const syncHighlight = useCallback(() => {
    const ta = textareaRef.current;
    const hl = highlightRef.current;
    if (!ta || !hl) return;
    hl.innerHTML = `${highlightContent(ta.value)}\n`;
  }, []);

  // Keep highlight in sync with programmatic value changes (form reset, enrichment, bidi sync)
  useEffect(() => {
    const hl = highlightRef.current;
    if (hl) {
      hl.innerHTML = `${highlightContent(value)}\n`;
    }
  }, [value]);

  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    const hl = highlightRef.current;
    if (!ta || !hl) return;
    hl.scrollTop = ta.scrollTop;
    hl.scrollLeft = ta.scrollLeft;
  }, []);

  const insert = useCallback(
    (kind: ChartInsert) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const next = applyChartInsert(
        { text: ta.value, start: ta.selectionStart, end: ta.selectionEnd },
        kind,
      );
      onContentChange(next.text);
      ta.focus();
      ta.setSelectionRange(next.start, next.end);
    },
    [onContentChange],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChartInsertBar onInsert={insert} />
        {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
      </div>
      <div className="chordpro-highlight-wrap relative min-h-[24rem] flex-1 lg:min-h-0">
        {/* Highlight layer (behind) */}
        <div
          ref={highlightRef}
          className="chordpro-highlight pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words"
          aria-hidden="true"
        />
        {/* Textarea (on top, transparent text) */}
        <textarea
          ref={mergedRef}
          name={name}
          onChange={(e) => {
            onChange(e);
            syncHighlight();
          }}
          onBlur={onBlur}
          onScroll={syncScroll}
          onFocus={syncHighlight}
          onInput={syncHighlight}
          placeholder={`{start_of_verse}\n[Am]Down the empty road again\n[C]Headlights cutting through\n{end_of_verse}`}
          rows={20}
          className="chordpro-textarea absolute inset-0 h-full w-full resize-none whitespace-pre-wrap break-words bg-transparent caret-text lg:resize-none"
          spellCheck={false}
        />
      </div>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
