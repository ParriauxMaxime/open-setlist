import { createId } from "@domain/id";
import { followIndex, postPosition, waitPosition } from "@domain/midi/companion";
import { FOLLOW_MODE, type FollowMode, saveMidiSettings } from "@domain/midi/settings";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMidiSettings } from "../../shared/hooks/use-midi-settings";
import type { FlatEntry } from "./use-setlist-navigation";

const RETRY_MS = 2000;

export interface FollowLeader {
  /** False without a companion program or outside a setlist: the menu entry is hidden. */
  available: boolean;
  mode: FollowMode;
  /** The companion program answered the last request. */
  connected: boolean;
  setMode: (mode: FollowMode) => void;
}

interface UseFollowLeaderOptions {
  setlistId: string | undefined;
  flatSongs: FlatEntry[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
}

/**
 * Optional "follow the leader": a leading device tells the companion program which song it
 * is on, following devices jump there. Local network only. Off by default.
 */
export function useFollowLeader(options: UseFollowLeaderOptions): FollowLeader {
  const { setlistId, currentIndex } = options;
  const settings = useMidiSettings();
  const base = settings.companion;
  const available = Boolean(base && setlistId);
  const mode = available ? settings.follow : FOLLOW_MODE.off;

  const [connected, setConnected] = useState(false);
  const [deviceId] = useState(createId);
  const latest = useRef(options);
  latest.current = options;

  // biome-ignore lint/correctness/useExhaustiveDependencies: currentIndex is the trigger
  useEffect(() => {
    if (mode !== FOLLOW_MODE.lead) return;
    const { setlistId: id, flatSongs, currentIndex: index } = latest.current;
    const entry = flatSongs[index];
    if (!id || !entry) return;
    const abort = new AbortController();
    postPosition(
      base,
      { from: deviceId, setlistId: id, songId: entry.songId, index },
      { signal: abort.signal },
    ).then(
      () => setConnected(true),
      () => {
        if (!abort.signal.aborted) setConnected(false);
      },
    );
    return () => abort.abort();
  }, [mode, base, deviceId, currentIndex]);

  useEffect(() => {
    if (mode !== FOLLOW_MODE.follow) return;
    const abort = new AbortController();
    const { signal } = abort;

    (async () => {
      // 0 asks for the leader's current position: a late follower catches up
      let after = 0;
      while (!signal.aborted) {
        try {
          const reply = await waitPosition(base, after, { signal });
          setConnected(true);
          if (!reply) continue;
          after = reply.seq;
          if (reply.position.from === deviceId) continue;
          const { setlistId: id, flatSongs, currentIndex: index, setCurrentIndex } = latest.current;
          const target = followIndex(
            reply.position,
            id ?? "",
            flatSongs.map((entry) => entry.songId),
          );
          if (target !== null && target !== index) setCurrentIndex(target);
        } catch {
          if (signal.aborted) return;
          setConnected(false);
          // A restarted companion counts from 1 again
          after = 0;
          await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
        }
      }
    })();
    return () => abort.abort();
  }, [mode, base, deviceId]);

  const setMode = useCallback((next: FollowMode) => {
    saveMidiSettings({ follow: next });
  }, []);

  return { available, mode, connected, setMode };
}
