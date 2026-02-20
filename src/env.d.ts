declare const __BASE_PATH__: string;
declare const __GOOGLE_CLIENT_ID__: string;

// Google Identity Services (loaded dynamically from accounts.google.com)
interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}
interface GoogleTokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}
declare interface Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient(config: {
          client_id: string;
          scope: string;
          callback: (response: GoogleTokenResponse) => void;
        }): GoogleTokenClient;
        revoke(token: string, callback?: () => void): void;
      };
    };
  };
  gapi?: {
    load(api: string, callback: () => void): void;
  };
}

// Google Picker API (loaded dynamically via gapi)
declare namespace google.picker {
  const Action: { PICKED: string; CANCEL: string; LOADED: string };
  const ViewId: { DOCS: string; FOLDERS: string };

  class DocsView {
    constructor(viewId?: string);
    setSelectFolderEnabled(enabled: boolean): DocsView;
    setMimeTypes(mimeTypes: string): DocsView;
  }

  class PickerBuilder {
    addView(view: DocsView): PickerBuilder;
    setOAuthToken(token: string): PickerBuilder;
    setCallback(callback: (data: PickerCallbackData) => void): PickerBuilder;
    setTitle(title: string): PickerBuilder;
    build(): Picker;
  }

  interface Picker {
    setVisible(visible: boolean): void;
    dispose(): void;
  }

  interface PickerDoc {
    id: string;
    name: string;
    type: string;
    mimeType: string;
  }

  interface PickerCallbackData {
    action: string;
    docs?: PickerDoc[];
  }
}

// rspack/webpack require.context
interface RequireContext {
  keys(): string[];
  <T = unknown>(key: string): T;
}

declare const require: {
  context(path: string, deep?: boolean, filter?: RegExp): RequireContext;
  (id: string): unknown;
};
