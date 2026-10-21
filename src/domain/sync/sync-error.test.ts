import { GoogleSignInError } from "../google-auth";
import { RemoteHttpError } from "./ports/remote-sync.port";
import { describeSyncError, SyncErrorKind } from "./sync-error";

describe("describeSyncError", () => {
  it.each([
    [401, "Bad credentials", SyncErrorKind.SignIn],
    [403, "Resource not accessible by personal access token", SyncErrorKind.NoAccess],
    [403, "API rate limit exceeded for user", SyncErrorKind.Busy],
    [404, "Not Found", SyncErrorKind.NotFound],
    [429, "Too many requests", SyncErrorKind.Busy],
    [502, "Bad gateway", SyncErrorKind.ServiceDown],
    [422, "Invalid request", SyncErrorKind.Unknown],
  ])("reads HTTP %i as %s", (status, message, kind) => {
    expect(describeSyncError(new RemoteHttpError(message, status))).toEqual({
      kind,
      detail: `HTTP ${status}: ${message}`,
    });
  });

  it("reads a failed fetch as offline", () => {
    expect(describeSyncError(new TypeError("Failed to fetch")).kind).toBe(SyncErrorKind.Offline);
    expect(describeSyncError(new TypeError("Load failed")).kind).toBe(SyncErrorKind.Offline);
  });

  it("is offline whatever the error when the browser is", () => {
    expect(describeSyncError(new RemoteHttpError("Bad credentials", 401), false).kind).toBe(
      SyncErrorKind.Offline,
    );
  });

  it("reads an unreadable band file as bad data, keeping the raw text", () => {
    const zod = Object.assign(new Error('[{"code":"invalid_type","path":["songs"]}]'), {
      name: "ZodError",
    });
    expect(describeSyncError(zod)).toEqual({ kind: SyncErrorKind.BadData, detail: zod.message });
    expect(describeSyncError(new SyntaxError("Unexpected token <")).kind).toBe(
      SyncErrorKind.BadData,
    );
  });

  it("reads a refused Google sign-in", () => {
    expect(describeSyncError(new GoogleSignInError("popup_closed")).kind).toBe(
      SyncErrorKind.SignIn,
    );
  });

  it("keeps anything else as unknown with its text", () => {
    expect(describeSyncError(new Error("Something odd"))).toEqual({
      kind: SyncErrorKind.Unknown,
      detail: "Something odd",
    });
    expect(describeSyncError(undefined).detail).toBe("");
  });
});
