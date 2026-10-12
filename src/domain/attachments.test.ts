import type { SongAttachment } from "@db/song";
import {
  ATTACHMENT_KIND,
  attachmentKind,
  CHART_VIEW,
  formatFileSize,
  partFromFileName,
  resolveStageView,
  stageAttachment,
  titleFromFileName,
} from "./attachments";

const CHART = "{title: Take Five}\n[Ebm]Take [Bbm7]five";

function attachment(id: string, part?: string): SongAttachment {
  return { id, name: `${id}.pdf`, type: "application/pdf", size: 1000, part };
}

describe("attachmentKind", () => {
  it("reads the MIME type", () => {
    expect(attachmentKind({ name: "a", type: "application/pdf" })).toBe(ATTACHMENT_KIND.pdf);
    expect(attachmentKind({ name: "a", type: "image/jpeg" })).toBe(ATTACHMENT_KIND.image);
  });

  it("falls back to the extension when the browser gives no type", () => {
    expect(attachmentKind({ name: "Score.PDF", type: "" })).toBe(ATTACHMENT_KIND.pdf);
    expect(attachmentKind({ name: "photo.jpeg", type: "" })).toBe(ATTACHMENT_KIND.image);
  });

  it("rejects other files", () => {
    expect(attachmentKind({ name: "notes.docx", type: "application/msword" })).toBeUndefined();
    expect(attachmentKind({ name: "song.cho", type: "" })).toBeUndefined();
  });
});

describe("file names", () => {
  it("makes a title out of a file name", () => {
    expect(titleFromFileName("03 - Take_Five  (Trompette).pdf")).toBe("Take Five (Trompette)");
    expect(titleFromFileName("7. Caravan.PDF")).toBe("Caravan");
  });

  it("finds the part named in a file name", () => {
    expect(partFromFileName("Take Five - Trompette.pdf")).toBe("trumpet");
    expect(partFromFileName("Caravan_sax-alto.pdf")).toBe("alto-sax");
    expect(partFromFileName("Caravan (Clavier).pdf")).toBe("keys");
    expect(partFromFileName("Take Five.pdf")).toBeUndefined();
  });

  it("formats sizes", () => {
    expect(formatFileSize(300)).toBe("1 KB");
    expect(formatFileSize(250_000)).toBe("244 KB");
    expect(formatFileSize(3_500_000)).toBe("3.3 MB");
  });
});

describe("resolveStageView", () => {
  it("shows the chart when there is no attachment", () => {
    expect(resolveStageView({ content: CHART }, "trumpet")).toBe(CHART_VIEW);
    expect(resolveStageView({ content: "", attachments: [] }, "all", "gone")).toBe(CHART_VIEW);
  });

  it("shows the sheet written for the musician's part", () => {
    const song = { content: CHART, attachments: [attachment("full"), attachment("tp", "trumpet")] };
    expect(resolveStageView(song, "trumpet")).toBe("tp");
    expect(resolveStageView(song, "trompette")).toBe("tp");
    expect(stageAttachment(song, "trumpet")?.id).toBe("tp");
  });

  it("keeps the chart for the others when the song has one", () => {
    const song = { content: CHART, attachments: [attachment("full"), attachment("tp", "trumpet")] };
    expect(resolveStageView(song, "guitar")).toBe(CHART_VIEW);
    expect(resolveStageView(song, "all")).toBe(CHART_VIEW);
    expect(stageAttachment(song, "guitar")).toBeUndefined();
  });

  it("shows a sheet when the song has no chart, the one for everyone first", () => {
    const withGeneral = {
      content: "",
      attachments: [attachment("tp", "trumpet"), attachment("full")],
    };
    expect(resolveStageView(withGeneral, "guitar")).toBe("full");
    const partsOnly = { content: "{title: X}", attachments: [attachment("tp", "trumpet")] };
    expect(resolveStageView(partsOnly, "all")).toBe("tp");
  });

  it("lets the musician's own choice win, unless the file is gone", () => {
    const song = { content: CHART, attachments: [attachment("full"), attachment("tp", "trumpet")] };
    expect(resolveStageView(song, "trumpet", CHART_VIEW)).toBe(CHART_VIEW);
    expect(resolveStageView(song, "guitar", "full")).toBe("full");
    expect(resolveStageView(song, "trumpet", "deleted")).toBe("tp");
  });
});
