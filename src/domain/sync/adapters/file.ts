import { snapshotSchema } from "../../schemas/snapshot";
import type { StorageAdapter } from "../adapter";

export const fileAdapter: StorageAdapter = {
  name: "File",

  async pull() {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";

      input.addEventListener("change", async () => {
        try {
          const file = input.files?.[0];
          if (!file) {
            reject(new Error("No file selected"));
            return;
          }
          const text = await file.text();
          const data = JSON.parse(text);
          resolve(snapshotSchema.parse(data));
        } catch (err) {
          reject(err);
        }
      });

      // Cancel from file picker — reject silently so caller can handle
      input.addEventListener("cancel", () => {
        reject(new DOMException("cancelled", "AbortError"));
      });

      input.click();
    });
  },

  async push(snapshot) {
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `open-setlist-${date}.json`;
    a.click();

    URL.revokeObjectURL(url);
  },

  isConfigured() {
    return true;
  },
};
