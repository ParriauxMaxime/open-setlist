import type { SongAttachment } from "@db";
import { useDb } from "@db/provider";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_LARGE_BYTES,
  attachmentKind,
  formatFileSize,
  partFromFileName,
} from "@domain/attachments";
import { createId } from "@domain/id";
import { PART_VALUES } from "@domain/parts";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Disclosure } from "../../design-system/components/card";
import { Select } from "../../design-system/components/form";
import { partLabel } from "../../performance/components/my-part-menu";

interface AttachmentsPanelProps {
  attachments: SongAttachment[];
  onChange: (attachments: SongAttachment[]) => void;
}

/**
 * Sheet music files of the song. Picked files are stored on the device right away; the
 * list itself is part of the song form and is saved with it.
 */
export function AttachmentsPanel({ attachments, onChange }: AttachmentsPanelProps) {
  const { t } = useTranslation();
  const db = useDb();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<string[]>([]);

  const addFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    const accepted = files.filter((file) => attachmentKind(file));
    setRejected(files.filter((file) => !attachmentKind(file)).map((file) => file.name));
    if (accepted.length === 0) return;

    const added = accepted.map(
      (file): SongAttachment => ({
        id: createId(),
        name: file.name,
        type: file.type || "application/pdf",
        size: file.size,
        part: partFromFileName(file.name),
      }),
    );
    await db.files.bulkPut(added.map((a, i) => ({ id: a.id, data: accepted[i] })));
    onChange([...attachments, ...added]);
  };

  const setPart = (id: string, part: string) =>
    onChange(attachments.map((a) => (a.id === id ? { ...a, part: part || undefined } : a)));

  return (
    <Disclosure
      summary={
        <>
          📄 {t("attachments.panelTitle")}
          {attachments.length > 0 && <Badge tone="muted">{attachments.length}</Badge>}
        </>
      }
      defaultOpen={attachments.length > 0}
      className="mb-3"
    >
      <div className="flex flex-col gap-2">
        {attachments.map((attachment) => (
          <div key={attachment.id} className="flex flex-wrap items-center gap-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{attachment.name}</p>
              <p
                className={`text-xs ${
                  attachment.size > ATTACHMENT_LARGE_BYTES ? "text-warning" : "text-text-faint"
                }`}
              >
                {formatFileSize(attachment.size)}
                {attachment.size > ATTACHMENT_LARGE_BYTES && ` · ${t("attachments.largeFile")}`}
              </p>
            </div>
            <Select
              value={attachment.part ?? ""}
              onChange={(e) => setPart(attachment.id, e.target.value)}
              aria-label={t("attachments.partLabel")}
              className="max-w-40"
            >
              <option value="">{t("attachments.everyone")}</option>
              {PART_VALUES.map((part) => (
                <option key={part} value={part}>
                  {partLabel(part, t, false)}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => onChange(attachments.filter((a) => a.id !== attachment.id))}
              className="btn btn-ghost btn-sm text-danger"
              aria-label={t("attachments.remove", { name: attachment.name })}
            >
              ✕
            </button>
          </div>
        ))}
        {rejected.length > 0 && (
          <p className="text-xs text-warning">
            {t("attachments.unsupported", { names: rejected.join(", ") })}
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={addFiles}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn btn-outline btn-sm self-start"
        >
          {t("attachments.add")}
        </button>
        <p className="text-xs text-text-muted">{t("attachments.hint")}</p>
      </div>
    </Disclosure>
  );
}
