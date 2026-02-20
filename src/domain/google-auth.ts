const GIS_URL = "https://accounts.google.com/gsi/client";
const SCOPE = "https://www.googleapis.com/auth/drive";

// Module-level state (memory only — never persisted)
let accessToken: string | null = null;
let tokenExpiresAt = 0;

export function isGoogleDriveAvailable(): boolean {
  return Boolean(__GOOGLE_CLIENT_ID__);
}

function loadGisScript(): Promise<void> {
  if (document.querySelector(`script[src="${GIS_URL}"]`)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
}

export async function requestAccessToken(): Promise<string> {
  // Return cached token if still valid (>60s remaining)
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) {
    return accessToken;
  }

  await loadGisScript();

  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error("Google Identity Services not available");
  }

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: __GOOGLE_CLIENT_ID__,
      scope: SCOPE,
      callback: (response: GoogleTokenResponse) => {
        if (response.error) {
          accessToken = null;
          tokenExpiresAt = 0;
          reject(new Error(response.error_description || response.error));
          return;
        }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + response.expires_in * 1000;
        resolve(response.access_token);
      },
    });

    // prompt: "" means silent if session active, popup if not
    client.requestAccessToken({ prompt: "" });
  });
}

export function clearAccessToken(): void {
  accessToken = null;
  tokenExpiresAt = 0;
}

export function revokeAccessToken(): void {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  clearAccessToken();
}

export function hasActiveToken(): boolean {
  return Boolean(accessToken && Date.now() < tokenExpiresAt - 60_000);
}
