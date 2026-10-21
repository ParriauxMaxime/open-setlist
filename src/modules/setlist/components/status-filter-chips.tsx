import {
  ACTIVE_STATUS_FILTER,
  SET_PICKER_STATUS_FILTER_LIST,
  songStatusLabelKey,
} from "@domain/song-status";
import { useTranslation } from "react-i18next";
import { Choice } from "../../design-system/components/card";

export type SetPickerStatusFilter = (typeof SET_PICKER_STATUS_FILTER_LIST)[number];

interface StatusFilterChipsProps {
  value: SetPickerStatusFilter;
  onChange: (value: SetPickerStatusFilter) => void;
}

/** In repertoire, To learn, Rehearsing…: which songs a set can be filled from. */
export function StatusFilterChips({ value, onChange }: StatusFilterChipsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5">
      {SET_PICKER_STATUS_FILTER_LIST.map((status) => (
        <Choice key={status || "all"} selected={value === status} onClick={() => onChange(status)}>
          {status === ACTIVE_STATUS_FILTER
            ? t("songStatus.filterActive")
            : status
              ? t(songStatusLabelKey(status))
              : t("common.all")}
        </Choice>
      ))}
    </div>
  );
}
