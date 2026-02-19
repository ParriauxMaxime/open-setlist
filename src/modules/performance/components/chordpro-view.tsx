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
          ) : (
            <div className="flex flex-wrap">
              {line.segments.map((seg, si) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are static parsed output
                <span key={si} className="inline-flex flex-col">
                  {seg.chord && (
                    // biome-ignore lint/a11y/noStaticElementInteractions: role is conditionally "button" when interactive
                    <span
                      data-chord-tap={onChordTap ? "" : undefined}
                      role={onChordTap ? "button" : undefined}
                      tabIndex={onChordTap ? 0 : undefined}
                      className={`self-start text-perform-chord font-bold text-chord${onChordTap ? " cursor-pointer" : ""}`}
                      onClick={
                        onChordTap
                          ? (e) => {
                              e.stopPropagation();
                              const r = e.currentTarget.getBoundingClientRect();
                              onChordTap({
                                chord: seg.chord as string,
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
                                  chord: seg.chord as string,
                                  anchorRect: { x: r.x, y: r.y, width: r.width, height: r.height },
                                });
                              }
                            }
                          : undefined
                      }
                    >
                      {seg.chord}
                    </span>
                  )}
                  <span className="text-perform-lyrics whitespace-pre-wrap">{seg.text}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
