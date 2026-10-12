import { createId } from "@domain/id";
import { useActiveProfileId } from "@domain/profiles";
import { isRelayAvailable } from "@domain/sync/adapters/relay";
import { loadSyncConfig } from "@domain/sync/config";
import {
  followIndex,
  LIVE_MODE,
  LIVE_STATE,
  type LiveChannel,
  type LiveMode,
  type LiveState,
  loadLiveMode,
  openLiveChannel,
  saveLiveMode,
} from "@domain/sync/live";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FlatEntry } from "./use-setlist-navigation";

export interface LiveSession {
  /** False outside a band setlist: the menu entry is hidden. */
  available: boolean;
  mode: LiveMode;
  state: LiveState;
  setMode: (mode: LiveMode) => void;
}

interface UseLiveSessionOptions {
  setlistId: string | undefined;
  flatSongs: FlatEntry[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
}

/** Leads or follows the band's live session while a setlist is on stage. */
export function useLiveSession(options: UseLiveSessionOptions): LiveSession {
  const { setlistId, currentIndex } = options;
  const profileId = useActiveProfileId();
  const code = useMemo(() => {
    const config = loadSyncConfig(profileId);
    return config?.adapter === "relay" && isRelayAvailable() ? config.code : null;
  }, [profileId]);
  const available = Boolean(code && setlistId);

  const [mode, setModeState] = useState<LiveMode>(() => loadLiveMode(profileId));
  const [state, setState] = useState<LiveState>(LIVE_STATE.connecting);
  const active = available ? mode : LIVE_MODE.off;

  const [deviceId] = useState(createId);
  const channelRef = useRef<LiveChannel | null>(null);
  const latest = useRef(options);
  latest.current = options;

  const sendPosition = useCallback(() => {
    const { setlistId: id, flatSongs, currentIndex: index } = latest.current;
    const entry = flatSongs[index];
    if (!id || !entry) return;
    channelRef.current?.send({
      type: "position",
      from: deviceId,
      setlistId: id,
      songId: entry.songId,
      index,
    });
  }, [deviceId]);

  useEffect(() => {
    if (!code || active === LIVE_MODE.off) return;
    const channel = openLiveChannel(code, {
      onState: (next) => {
        setState(next);
        if (next !== LIVE_STATE.open) return;
        if (active === LIVE_MODE.lead) sendPosition();
        else channel.send({ type: "hello", from: deviceId });
      },
      onMessage: (message) => {
        if (message.type === "hello") {
          if (active === LIVE_MODE.lead) sendPosition();
          return;
        }
        if (active !== LIVE_MODE.follow) return;
        const { setlistId: id, flatSongs, currentIndex: index, setCurrentIndex } = latest.current;
        const target = followIndex(
          message,
          id ?? "",
          flatSongs.map((entry) => entry.songId),
        );
        if (target !== null && target !== index) setCurrentIndex(target);
      },
    });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, [code, active, deviceId, sendPosition]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: currentIndex is the trigger
  useEffect(() => {
    if (active === LIVE_MODE.lead) sendPosition();
  }, [active, currentIndex, sendPosition]);

  const setMode = useCallback(
    (next: LiveMode) => {
      saveLiveMode(profileId, next);
      setModeState(next);
    },
    [profileId],
  );

  return { available, mode: active, state, setMode };
}
