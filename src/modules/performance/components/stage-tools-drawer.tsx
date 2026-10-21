import type { Song } from "@db";
import { isPartViewActive } from "@domain/chordpro/visibility";
import { FOLLOW_MODE } from "@domain/midi/settings";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { FollowLeader } from "../hooks/use-follow-leader";
import type { MyPart } from "../hooks/use-my-part";
import type { StageMidi } from "../hooks/use-stage-midi";
import type { Tempo } from "../hooks/use-tempo";
import { KeyChips } from "./key-chips";
import { MyPartChip } from "./my-part-menu";
import { ScrollSpeedControl, TransposeControl } from "./stage-controls";
import { FollowChip, MidiChip } from "./stage-midi";
import { TempoChip } from "./tempo-chip";

export const STAGE_TOOLS_ID = "stage-tools";

interface StageToolsDrawerProps {
  song: Song | undefined;
  transposition: number;
  onTranspose: (delta: number) => void;
  tempo: Tempo;
  showScrollSpeed: boolean;
  scrollSpeed: number | null;
  scrollSpeedDerived: boolean;
  onScrollSpeed: (delta: number) => void;
  myPart: MyPart;
  midi: StageMidi;
  follow: FollowLeader;
  onOpenMenu: () => void;
}

/** Phones: what the wide bar shows inline, one labelled row each, under the title. */
export function StageToolsDrawer({
  song,
  transposition,
  onTranspose,
  tempo,
  showScrollSpeed,
  scrollSpeed,
  scrollSpeedDerived,
  onScrollSpeed,
  myPart,
  midi,
  follow,
  onOpenMenu,
}: StageToolsDrawerProps) {
  const { t } = useTranslation();

  return (
    <div id={STAGE_TOOLS_ID} className="border-t border-border px-4 pt-1 pb-2 sm:hidden">
      <div className="py-1 empty:hidden">
        <KeyChips song={song} transposition={transposition} partView={myPart.view} />
      </div>
      {tempo.bpm !== undefined && (
        <ToolRow label={t("performStage.toolsTempo")}>
          <TempoChip tempo={tempo} />
        </ToolRow>
      )}
      <ToolRow label={t("perform.transpose")}>
        <TransposeControl transposition={transposition} onTranspose={onTranspose} />
      </ToolRow>
      {showScrollSpeed && (
        <ToolRow label={t("performStage.scrollSpeedLabel")}>
          <ScrollSpeedControl
            speed={scrollSpeed}
            derived={scrollSpeedDerived}
            onChange={onScrollSpeed}
          />
        </ToolRow>
      )}
      {isPartViewActive(myPart.view) && (
        <ToolRow label={t("myPart.title")}>
          <MyPartChip myPart={myPart} onClick={onOpenMenu} />
        </ToolRow>
      )}
      {midi.active && (
        <ToolRow label={t("performStage.toolsMidi")}>
          <MidiChip midi={midi} />
        </ToolRow>
      )}
      {follow.mode !== FOLLOW_MODE.off && (
        <ToolRow label={t("midi.follow.title")}>
          <FollowChip follow={follow} onClick={onOpenMenu} />
        </ToolRow>
      )}
    </div>
  );
}

function ToolRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-base text-text-muted">{label}</span>
      <div className="flex min-w-0 items-center gap-0.5">{children}</div>
    </div>
  );
}
