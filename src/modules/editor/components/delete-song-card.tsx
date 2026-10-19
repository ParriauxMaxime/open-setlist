import { useTranslation } from "react-i18next";
import { Card, CardRow } from "../../design-system/components/card";

export function DeleteSongCard({ onDelete }: { onDelete: () => void }) {
  const { t } = useTranslation();

  return (
    <Card title={t("settings.danger.heading")} danger>
      <CardRow label={t("editor.deleteTitle")} description={t("editor.deleteDesc")}>
        <button type="button" onClick={onDelete} className="btn btn-danger btn-sm">
          {t("common.delete")}
        </button>
      </CardRow>
    </Card>
  );
}
