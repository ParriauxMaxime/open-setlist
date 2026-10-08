import type {
  ChordProSong,
  CommentLine,
  LyricLine,
  Section,
  Segment,
  SongLine,
} from "@domain/chordpro/parser";
import { formatChord } from "@domain/chords/notation";
import { transposeChord } from "@domain/chords/transpose";
import { useTranslation } from "react-i18next";
import { useNotation } from "../../shared/hooks/use-notation";

// Lean, print-only ChordPro renderer: chords above lyrics, black on white,
// no interactivity. Sizes are relative to the page's base font size.

interface PrintChartProps {
  chart: ChordProSong;
  transposition?: number;
}

type ChordLabel = (chord: string) => string;

export function PrintChart({ chart, transposition = 0 }: PrintChartProps) {
  const notation = useNotation();
  const songKey = chart.metadata.key;
  const chordLabel: ChordLabel = (c) =>
    formatChord(transposition ? transposeChord(c, transposition, songKey) : c, notation);
  return (
    <div className="flex flex-col gap-[0.6em]">
      {chart.sections.map((section, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: sections are static parsed output
        <PrintSection key={i} section={section} chordLabel={chordLabel} />
      ))}
    </div>
  );
}

const SECTION_LABEL_CLASS = "text-[0.8em] font-bold uppercase tracking-wider text-text-muted";

function PrintSection({ section, chordLabel }: { section: Section; chordLabel: ChordLabel }) {
  // A standalone chorus recall prints its own label
  const recallOnly = section.lines.every((l) => l.kind === "chorus-recall");
  const label = section.label ?? (section.type === "custom" ? undefined : section.type);
  const mono = section.renderMode === "monospace";

  return (
    <section
      className={[
        "break-inside-avoid",
        mono ? "font-mono" : "",
        section.type === "chorus" ? "border-l-2 border-text pl-[0.6em]" : "",
      ].join(" ")}
    >
      {!recallOnly && label && <h3 className={SECTION_LABEL_CLASS}>{label}</h3>}
      <Lines lines={section.lines} chordLabel={chordLabel} mono={mono} />
    </section>
  );
}

function Lines({
  lines,
  chordLabel,
  mono,
}: {
  lines: SongLine[];
  chordLabel: ChordLabel;
  mono: boolean;
}) {
  const { t } = useTranslation();

  return lines.map((line, i) => {
    switch (line.kind) {
      case "comment":
        // biome-ignore lint/suspicious/noArrayIndexKey: lines are static parsed output
        return <Comment key={i} line={line} />;
      case "chorus-recall":
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are static parsed output
          <div key={i}>
            <h3 className={SECTION_LABEL_CLASS}>
              {line.label ?? line.chorus?.label ?? t("chordpro.chorus")} (↻ {t("chordpro.repeat")})
            </h3>
            {line.chorus && <Lines lines={line.chorus.lines} chordLabel={chordLabel} mono={mono} />}
          </div>
        );
      default:
        // biome-ignore lint/suspicious/noArrayIndexKey: lines are static parsed output
        return <Lyric key={i} line={line} chordLabel={chordLabel} mono={mono} />;
    }
  });
}

const COMMENT_CLASS: Record<CommentLine["style"], string> = {
  default: "italic text-text-muted",
  italic: "italic text-text-muted",
  box: "inline-block border border-text px-[0.3em] italic",
  highlight: "bg-highlight italic underline",
};

function Comment({ line }: { line: CommentLine }) {
  return (
    <p className="whitespace-pre-wrap">
      <span className={COMMENT_CLASS[line.style]}>
        {line.text}
        {line.instrument && ` (${line.instrument})`}
      </span>
    </p>
  );
}

function SegmentText({ segment }: { segment: Segment }) {
  return segment.highlight ? (
    <span className="bg-highlight underline">{segment.text}</span>
  ) : (
    segment.text
  );
}

function Lyric({
  line,
  chordLabel: chord,
  mono,
}: {
  line: LyricLine;
  chordLabel: ChordLabel;
  mono: boolean;
}) {
  const { segments } = line;
  const wrap = mono ? "whitespace-pre" : "whitespace-break-spaces";

  if (segments.every((s) => !s.chord && !s.text)) return <div className="h-[0.6em]" />;

  if (!segments.some((s) => s.chord)) {
    return (
      <p className={wrap}>
        {segments.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are static parsed output
          <SegmentText key={i} segment={s} />
        ))}
      </p>
    );
  }

  // Chords only (intro, riff): one row, keeping the spacing written in the chart
  if (segments.every((s) => !s.text.trim())) {
    return (
      <p className={`${wrap} font-bold text-chord`}>
        {segments.map((s) => `${s.chord ? chord(s.chord) : ""}${s.text || " "}`).join("")}
      </p>
    );
  }

  // Each segment stacks its chord over its lyric; segments are as wide as the
  // wider of the two, so chords never overlap.
  return (
    <div className="flex flex-wrap items-end">
      {segments.map((s, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: segments are static parsed output
        <span key={i} className={`inline-flex flex-col ${wrap}`}>
          <span className="pr-[0.4em] font-bold text-chord">{s.chord ? chord(s.chord) : "​"}</span>
          <span>{s.text ? <SegmentText segment={s} /> : "​"}</span>
        </span>
      ))}
    </div>
  );
}
