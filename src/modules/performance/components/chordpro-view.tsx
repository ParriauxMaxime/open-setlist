import { parse, type Section } from "@domain/chordpro/parser";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface ChordTapInfo {
  chord: string;
  anchorRect: { x: number; y: number; width: number; height: number };
}

interface ChordProViewProps {
  content: string;
  onChordTap?: (info: ChordTapInfo) => void;
}

export function ChordProView({ content, onChordTap }: ChordProViewProps) {
  const { t } = useTranslation();
  const parsed = useMemo(() => parse(content), [content]);

  if (parsed.sections.length === 0 && content.trim() === "") {
    return <p className="text-text-faint italic">{t("perform.noContent")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {parsed.sections.map((section, si) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: sections are static parsed output
        <SectionView key={si} section={section} onChordTap={onChordTap} />
      ))}
    </div>
  );
}

function ChordToken({
  chord,
  onChordTap,
  className,
}: {
  chord: string;
  onChordTap?: (info: ChordTapInfo) => void;
  className?: string;
}) {
  const base = `text-perform-chord font-bold text-chord${onChordTap ? " cursor-pointer" : ""}`;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: role is conditionally "button" when interactive
    <span
      data-chord-tap={onChordTap ? "" : undefined}
      role={onChordTap ? "button" : undefined}
      tabIndex={onChordTap ? 0 : undefined}
      className={className ? `${base} ${className}` : base}
      onClick={
        onChordTap
          ? (e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              onChordTap({
                chord,
                anchorRect: { x: r.x, y: r.y, width: r.width, height: r.height },
              });
            }
          : undefined
      }
      onKeyDown={
        onChordTap
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                onChordTap({
                  chord,
                  anchorRect: { x: r.x, y: r.y, width: r.width, height: r.height },
                });
              }
            }
          : undefined
      }
    >
      {chord}
    </span>
  );
}

function SectionView({
  section,
  onChordTap,
}: {
  section: Section;
  onChordTap?: (info: ChordTapInfo) => void;
}) {
  const bgClass =
    section.type === "verse"
      ? "bg-section-verse"
      : section.type === "chorus"
        ? "bg-section-chorus"
        : section.type === "bridge"
          ? "bg-section-bridge"
          : "";

  return (
    <div className={`rounded-md px-3 py-2 ${bgClass}`}>
      {section.label && (
        <div className="mb-1 text-perform-section font-medium uppercase tracking-wider text-text-faint">
          {section.label}
        </div>
      )}
      {section.type !== "custom" && !section.label && (
        <div className="mb-1 text-perform-section font-medium uppercase tracking-wider text-text-faint">
          {section.type}
        </div>
      )}
      {section.lines.map((line, li) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines are static parsed output
        <div key={li} className="leading-relaxed">
          {line.segments.every((s) => s.text === "" && !s.chord) ? (
            <div className="h-3" />
          ) : line.segments.every((s) => !s.text.trim()) ? (
            <div className="text-perform-chord font-bold text-chord whitespace-pre-wrap">
              {line.segments.map((seg, si) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are static parsed output
                <span key={si}>
                  {seg.chord && <ChordToken chord={seg.chord} onChordTap={onChordTap} />}
                  {seg.text}
                </span>
              ))}
            </div>
          ) : line.segments.some((s) => s.chord) &&
            line.segments.filter((s) => s.chord).every((s) => !s.text.trim()) ? (
            <div className="text-perform-lyrics whitespace-pre-wrap">
              {line.segments.map((seg, si) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are static parsed output
                <span key={si}>
                  {seg.chord && <ChordToken chord={seg.chord} onChordTap={onChordTap} />}
                  {seg.text}
                </span>
              ))}
            </div>
          ) : (
            <div
              className={`text-perform-lyrics whitespace-pre-wrap${
                line.segments.some((s) => s.chord) ? " relative pt-[var(--text-perform-chord)]" : ""
              }`}
            >
              {line.segments.map((seg, si) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: segments are static parsed output
                  key={si}
                  className={
                    seg.chord
                      ? seg.text.length < seg.chord.length + 2
                        ? "relative inline-block align-bottom"
                        : "relative"
                      : undefined
                  }
                  style={
                    seg.chord && seg.text.length < seg.chord.length + 2
                      ? { minWidth: `${seg.chord.length + 1}ch` }
                      : undefined
                  }
                >
                  {seg.chord && (
                    <ChordToken
                      chord={seg.chord}
                      onChordTap={onChordTap}
                      className="absolute bottom-full left-0 leading-none"
                    />
                  )}
                  {seg.text}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
