import { Link } from "@swan-io/chicane";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { SidebarNav } from "../../shared/components/sidebar-nav";
import { SidebarPanel } from "../../shared/components/sidebar-panel";

const PERFORM_RETURN_KEY = "open-setlist-perform-return";

export interface PerformReturn {
  setlistId?: string;
  songId?: string;
}

export function setPerformReturn(ret: PerformReturn) {
  sessionStorage.setItem(PERFORM_RETURN_KEY, JSON.stringify(ret));
}

export function getPerformReturn(): PerformReturn | null {
  try {
    const raw = sessionStorage.getItem(PERFORM_RETURN_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearPerformReturn() {
  sessionStorage.removeItem(PERFORM_RETURN_KEY);
}

interface PerformSidebarProps {
  open: boolean;
  onClose: () => void;
  setlistId?: string;
  songId?: string;
}

export function PerformSidebar({ open, onClose, setlistId, songId }: PerformSidebarProps) {
  const { t } = useTranslation();

  const storeReturn = () => {
    if (setlistId) setPerformReturn({ setlistId });
    else if (songId) setPerformReturn({ songId });
  };

  const exitHref = setlistId
    ? Router.SetlistEdit({ setlistId })
    : songId
      ? Router.SongEdit({ songId })
      : Router.Catalog();

  const exitLabel = setlistId
    ? t("perform.exitToSetlist")
    : songId
      ? t("perform.exitToSong")
      : t("perform.exit");

  return (
    <SidebarPanel open={open} onClose={onClose}>
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium text-text hover:bg-bg-hover"
      >
        <span className="text-lg">&larr;</span>
        {t("common.close")}
      </button>

      <div className="flex flex-col gap-1 p-3">
        {/* Exit performance */}
        <Link
          to={exitHref}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-accent hover:bg-accent-muted"
        >
          <span className="text-lg">&#9654;</span>
          {exitLabel}
        </Link>

        <div className="my-1 border-t border-border" />

        {/* Nav links */}
        <SidebarNav onNavigate={storeReturn} />
      </div>
    </SidebarPanel>
  );
}
