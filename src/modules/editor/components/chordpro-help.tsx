import { useTranslation } from "react-i18next";

export function ChordProHelp() {
  const { t } = useTranslation();

  return (
    <details className="group rounded-md border border-border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-text-muted select-none">
        {t("editor.chordproHelp")}
      </summary>
      <div className="border-t border-border px-3 py-3 text-sm text-text-muted">
        <Section title="Metadata">
          <Code>{`{title: Song Name}`}</Code>
          <Code>{`{artist: Band Name}`}</Code>
          <Code>{`{key: Am}  {bpm: 120}  {capo: 2}`}</Code>
          <Code>{`{time: 4/4}  {duration: 4:32}`}</Code>
          <Code>{`{tags: rock, high-energy, opener}`}</Code>
          <Code>{`{notes: Start soft, build into chorus}`}</Code>
        </Section>

        <Section title="Sections">
          <Code>{`{start_of_verse: Verse 1} ... {end_of_verse}`}</Code>
          <Code>{`{start_of_chorus} ... {end_of_chorus}`}</Code>
          <Code>{`{start_of_bridge} ... {end_of_bridge}`}</Code>
          <Code>{`{start_of_tab: Solo} ... {end_of_tab}`}</Code>
          <Code>{`{start_of_note: Arrangement} ... {end_of_note}`}</Code>
          <p className="mt-1 text-text-faint">
            Short forms: <Mono>sov/eov</Mono>, <Mono>soc/eoc</Mono>, <Mono>sob/eob</Mono>,{" "}
            <Mono>sot/eot</Mono>
          </p>
        </Section>

        <Section title="Chords">
          <Code>{`[Am]Down the empty [F]road again`}</Code>
          <p className="mt-1 text-text-faint">
            Supports: <Mono>A</Mono>-<Mono>G</Mono>, sharps <Mono>#</Mono>, flats <Mono>b</Mono>,
            slash chords <Mono>[C/B]</Mono>, extensions <Mono>7 m maj7 sus4 dim aug add9</Mono>
          </p>
          <p className="mt-1 text-text-faint">
            Annotations (not transposed): <Mono>[*N.C.]</Mono>, <Mono>[*Coda]</Mono>
          </p>
        </Section>

        <Section title="Layers">
          <Code>{`{start_of_tab: Riff, for=guitar}`}</Code>
          <Code>{`{comment: Use brush sticks, for=drums}`}</Code>
          <p className="mt-1 text-text-faint">
            <Mono>for=instrument</Mono> scopes a section to a specific player.
          </p>
        </Section>

        <Section title="Comments" last>
          <Code>{`{comment: Drums drop out here}`}</Code>
          <Code>{`{comment_italic: Softly}  {comment_box: Key change!}`}</Code>
          <p className="mt-1 text-text-faint">
            Short forms: <Mono>c</Mono>, <Mono>ci</Mono>, <Mono>cb</Mono>
          </p>
        </Section>
      </div>
    </details>
  );
}

function Section({
  title,
  children,
  last = false,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={last ? "" : "mb-3"}>
      <h4 className="mb-1 font-semibold text-text">{title}</h4>
      {children}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="whitespace-pre-wrap break-all rounded bg-bg-raised px-2 py-0.5 font-mono text-xs leading-relaxed">
      {children}
    </pre>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-bg-raised px-1 py-0.5 font-mono text-xs">{children}</code>;
}
