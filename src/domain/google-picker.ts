const GAPI_URL = "https://apis.google.com/js/api.js";

function loadGapiScript(): Promise<void> {
  if (document.querySelector(`script[src="${GAPI_URL}"]`)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GAPI_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google API"));
    document.head.appendChild(script);
  });
}

function loadPickerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.gapi) {
      reject(new Error("Google API not available"));
      return;
    }
    window.gapi.load("picker", () => resolve());
  });
}

export interface PickerResult {
  type: "folder" | "file";
  id: string;
  name: string;
}

export async function showDrivePicker(accessToken: string): Promise<PickerResult | null> {
  await loadGapiScript();
  await loadPickerApi();

  return new Promise((resolve) => {
    const folderView = new google.picker.DocsView(
      google.picker.ViewId.FOLDERS,
    ).setSelectFolderEnabled(true);

    const fileView = new google.picker.DocsView().setMimeTypes("application/json");

    const picker = new google.picker.PickerBuilder()
      .addView(folderView)
      .addView(fileView)
      .setOAuthToken(accessToken)
      .setTitle("Choose a folder or select an existing file")
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED && data.docs?.length) {
          const doc = data.docs[0];
          const isFolder = doc.mimeType === "application/vnd.google-apps.folder";
          resolve({ type: isFolder ? "folder" : "file", id: doc.id, name: doc.name });
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}
