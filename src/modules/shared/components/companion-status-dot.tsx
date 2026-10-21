import { COMPANION_LINK } from "@domain/midi/companion-link";
import { useTranslation } from "react-i18next";
import { useCompanionLink } from "../hooks/use-companion-link";

const TONE = {
  [COMPANION_LINK.connected]: "bg-success",
  [COMPANION_LINK.lost]: "bg-danger",
  [COMPANION_LINK.connecting]: "bg-text-faint",
  [COMPANION_LINK.paused]: "bg-text-faint",
} as const;

/** Green when the companion answers, red when it stopped; nothing when none is paired. */
export function CompanionStatusDot() {
  const { t } = useTranslation();
  const { state } = useCompanionLink();
  if (state === COMPANION_LINK.off) return null;
  return (
    <span className="flex items-center" title={t(`companion.link.${state}`)}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${TONE[state]}`} />
      <span className="sr-only">{t(`companion.link.${state}`)}</span>
    </span>
  );
}
