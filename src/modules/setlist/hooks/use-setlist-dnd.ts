import type { SetlistSet } from "@db";
import {
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useCallback, useState } from "react";

// --- Drag ID helpers ---
// IDs are content-based so they stay stable across reorders:
//   song:{setIndex}:{songId}:{occurrence}   e.g. song:0:abc123:0
//   set:{setIndex}                           e.g. set:1
//   catalog:{songId}                         e.g. catalog:abc123

type DragType = "song" | "set" | "catalog" | "catalog-panel";

interface ParsedSongDragId {
  type: "song";
  setIndex: number;
  songId: string;
  occurrence: number;
}

interface ParsedSetDragId {
  type: "set";
  setIndex: number;
}

interface ParsedCatalogDragId {
  type: "catalog";
  songId: string;
}

interface ParsedCatalogPanelId {
  type: "catalog-panel";
}

type ParsedDragId = ParsedSongDragId | ParsedSetDragId | ParsedCatalogDragId | ParsedCatalogPanelId;

export function parseDragId(id: string): ParsedDragId {
  // The catalog panel droppable has the bare id "catalog" (no colon)
  if (id === "catalog") {
    return { type: "catalog-panel" };
  }

  const colon = id.indexOf(":");
  const type = id.slice(0, colon) as DragType;

  if (type === "set") {
    return { type, setIndex: Number(id.slice(colon + 1)) };
  }
  if (type === "catalog") {
    return { type, songId: id.slice(colon + 1) };
  }
  // song:{setIndex}:{songId}:{occurrence}
  const rest = id.slice(colon + 1);
  const firstColon = rest.indexOf(":");
  const setIndex = Number(rest.slice(0, firstColon));
  const lastColon = rest.lastIndexOf(":");
  const songId = rest.slice(firstColon + 1, lastColon);
  const occurrence = Number(rest.slice(lastColon + 1));
  return { type: "song", setIndex, songId, occurrence };
}

/** Build all song drag IDs for a single set (stable, content-based). */
export function buildSongDragIds(setIndex: number, songIds: string[]): string[] {
  const counts: Record<string, number> = {};
  return songIds.map((songId) => {
    const occ = counts[songId] ?? 0;
    counts[songId] = occ + 1;
    return `song:${setIndex}:${songId}:${occ}`;
  });
}

export function buildSetDragId(setIndex: number): string {
  return `set:${setIndex}`;
}

export function buildCatalogDragId(songId: string): string {
  return `catalog:${songId}`;
}

/** Find the array index of a song given its songId + occurrence within a set. */
function findSongArrayIndex(songIds: string[], songId: string, occurrence: number): number {
  let count = 0;
  for (let i = 0; i < songIds.length; i++) {
    if (songIds[i] === songId) {
      if (count === occurrence) return i;
      count++;
    }
  }
  return -1;
}

// --- Hook ---

interface UseSetlistDndOptions {
  sets: SetlistSet[];
  updateSet: (index: number, set: SetlistSet) => void;
  moveSet: (from: number, to: number) => void;
}

export interface ActiveDrag {
  id: string;
  type: DragType;
  songTitle?: string;
  setName?: string;
}

export function useSetlistDnd({ sets, updateSet, moveSet }: UseSetlistDndOptions) {
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    const parsed = parseDragId(id);
    setActiveDrag({
      id,
      type: parsed.type,
      songTitle: event.active.data.current?.songTitle,
      setName: event.active.data.current?.setName,
    });
  }, []);

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;
      if (activeId === overId) return;

      const activeParsed = parseDragId(activeId);
      const overParsed = parseDragId(overId);

      // Cross-set song move: move the song to the target set during drag
      // so dnd-kit can sort within the new container.
      if (activeParsed.type === "song" && overParsed.type === "song") {
        if (activeParsed.setIndex !== overParsed.setIndex) {
          const sourceSet = sets[activeParsed.setIndex];
          const targetSet = sets[overParsed.setIndex];
          if (!sourceSet || !targetSet) return;

          const srcIdx = findSongArrayIndex(
            sourceSet.songIds,
            activeParsed.songId,
            activeParsed.occurrence,
          );
          if (srcIdx === -1) return;

          const dstIdx = findSongArrayIndex(
            targetSet.songIds,
            overParsed.songId,
            overParsed.occurrence,
          );
          if (dstIdx === -1) return;

          const songId = sourceSet.songIds[srcIdx];

          const newSourceSongIds = [...sourceSet.songIds];
          newSourceSongIds.splice(srcIdx, 1);
          updateSet(activeParsed.setIndex, { ...sourceSet, songIds: newSourceSongIds });

          const newTargetSongIds = [...targetSet.songIds];
          newTargetSongIds.splice(dstIdx, 0, songId);
          updateSet(overParsed.setIndex, { ...targetSet, songIds: newTargetSongIds });
        }
      }

      // Song dragged over an empty set container
      if (activeParsed.type === "song" && overParsed.type === "set") {
        if (activeParsed.setIndex !== overParsed.setIndex) {
          const sourceSet = sets[activeParsed.setIndex];
          const targetSet = sets[overParsed.setIndex];
          if (!sourceSet || !targetSet) return;

          const srcIdx = findSongArrayIndex(
            sourceSet.songIds,
            activeParsed.songId,
            activeParsed.occurrence,
          );
          if (srcIdx === -1) return;

          const songId = sourceSet.songIds[srcIdx];

          const newSourceSongIds = [...sourceSet.songIds];
          newSourceSongIds.splice(srcIdx, 1);
          updateSet(activeParsed.setIndex, { ...sourceSet, songIds: newSourceSongIds });

          const newTargetSongIds = [...targetSet.songIds, songId];
          updateSet(overParsed.setIndex, { ...targetSet, songIds: newTargetSongIds });
        }
      }
    },
    [sets, updateSet],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDrag(null);
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;
      if (activeId === overId) return;

      const activeParsed = parseDragId(activeId);
      const overParsed = parseDragId(overId);

      // --- Within-set song reorder ---
      if (
        activeParsed.type === "song" &&
        overParsed.type === "song" &&
        activeParsed.setIndex === overParsed.setIndex
      ) {
        const setIdx = activeParsed.setIndex;
        const set = sets[setIdx];
        if (!set) return;

        const fromIdx = findSongArrayIndex(
          set.songIds,
          activeParsed.songId,
          activeParsed.occurrence,
        );
        const toIdx = findSongArrayIndex(set.songIds, overParsed.songId, overParsed.occurrence);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

        const newSongIds = [...set.songIds];
        const [moved] = newSongIds.splice(fromIdx, 1);
        newSongIds.splice(toIdx, 0, moved);
        updateSet(setIdx, { ...set, songIds: newSongIds });
        return;
      }

      // --- Set reorder ---
      if (activeParsed.type === "set" && overParsed.type === "set") {
        moveSet(activeParsed.setIndex, overParsed.setIndex);
        return;
      }

      // --- Catalog → song slot ---
      if (activeParsed.type === "catalog" && overParsed.type === "song") {
        const targetSetIdx = overParsed.setIndex;
        const targetSet = sets[targetSetIdx];
        if (!targetSet) return;
        const dstIdx = findSongArrayIndex(
          targetSet.songIds,
          overParsed.songId,
          overParsed.occurrence,
        );
        if (dstIdx === -1) return;
        const newSongIds = [...targetSet.songIds];
        newSongIds.splice(dstIdx, 0, activeParsed.songId);
        updateSet(targetSetIdx, { ...targetSet, songIds: newSongIds });
        return;
      }

      // --- Catalog → set container ---
      if (activeParsed.type === "catalog" && overParsed.type === "set") {
        const targetSetIdx = overParsed.setIndex;
        const targetSet = sets[targetSetIdx];
        if (!targetSet) return;
        updateSet(targetSetIdx, {
          ...targetSet,
          songIds: [...targetSet.songIds, activeParsed.songId],
        });
        return;
      }

      // --- Song → catalog panel (remove from set) ---
      if (activeParsed.type === "song" && overParsed.type === "catalog-panel") {
        const sourceSet = sets[activeParsed.setIndex];
        if (!sourceSet) return;
        const srcIdx = findSongArrayIndex(
          sourceSet.songIds,
          activeParsed.songId,
          activeParsed.occurrence,
        );
        if (srcIdx === -1) return;
        const newSongIds = [...sourceSet.songIds];
        newSongIds.splice(srcIdx, 1);
        updateSet(activeParsed.setIndex, { ...sourceSet, songIds: newSongIds });
        return;
      }
    },
    [sets, updateSet, moveSet],
  );

  return { sensors, onDragStart, onDragOver, onDragEnd, activeDrag };
}
