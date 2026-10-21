import { currentPlatform, deviceId } from "@domain/device";
import {
  COMPANION_LINK,
  type CompanionLink,
  companionLink,
  nudgeHeartbeat,
  runCompanionLink,
  setCompanionLink,
  subscribeCompanionLink,
} from "@domain/midi/companion-link";
import {
  buildPresence,
  currentStageReport,
  reportStage,
  type StageReport,
} from "@domain/midi/presence";
import { saveMidiSettings } from "@domain/midi/settings";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { partLabel } from "../../performance/components/my-part-menu";
import { useMidiSettings } from "./use-midi-settings";

/** The link to the paired companion program, live. */
export function useCompanionLink(): CompanionLink {
  return useSyncExternalStore(subscribeCompanionLink, companionLink);
}

/**
 * Keeps the link to the paired companion up while the app is open, and reports this device
 * to it. Mounted once, at the top of the app; `page` is the current route's name.
 */
export function useCompanionLinkRunner(page: string): void {
  const { t } = useTranslation();
  const settings = useMidiSettings();
  const { companion: base, companionPaused: paused } = settings;

  const latest = useRef({ page, settings, t });
  latest.current = { page, settings, t };

  useEffect(() => {
    if (!base) return setCompanionLink({ state: COMPANION_LINK.off, base: "", status: null });
    if (paused) return setCompanionLink({ state: COMPANION_LINK.paused, base, status: null });
    const abort = new AbortController();
    const presence = () => {
      const current = latest.current;
      const role = current.settings.role;
      return buildPresence({
        id: deviceId(),
        partLabel: role ? partLabel(role, current.t, false) : "",
        platform: currentPlatform(),
        appVersion: __APP_VERSION__,
        page: current.page,
        settings: current.settings,
        ...currentStageReport(),
      });
    };
    runCompanionLink(base, {
      signal: abort.signal,
      presence,
      onMoved: (found) => saveMidiSettings({ companion: found }),
    });
    return () => abort.abort();
  }, [base, paused]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new page or setting is reported at once
  useEffect(() => nudgeHeartbeat(), [page, settings]);
}

/** Tells the companion where this stage view is, until it closes. */
export function useReportStage(report: StageReport): void {
  const { setlistId, songId, index, follow } = report;
  useEffect(() => {
    reportStage({ setlistId, songId, index, follow });
  }, [setlistId, songId, index, follow]);
  useEffect(() => () => reportStage({}), []);
}
