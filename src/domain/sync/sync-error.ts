/**
 * What went wrong with a sync, said plainly: the service's raw answer (HTTP status, JSON,
 * validation output) is kept as the detail, for the "Details" fold and bug reports.
 */

import { GoogleSignInError } from "../google-auth";
import { RemoteHttpError } from "./ports/remote-sync.port";

export const SyncErrorKind = {
  Offline: "offline",
  SignIn: "signIn",
  NoAccess: "noAccess",
  NotFound: "notFound",
  Busy: "busy",
  ServiceDown: "serviceDown",
  BadData: "badData",
  Unknown: "unknown",
} as const;

export type SyncErrorKind = (typeof SyncErrorKind)[keyof typeof SyncErrorKind];

export interface SyncProblem {
  kind: SyncErrorKind;
  /** The raw error text, empty when there is none. */
  detail: string;
}

const NETWORK_FAILURE_RE = /failed to fetch|networkerror|load failed|network request failed/i;
const RATE_LIMIT_RE = /rate limit/i;

function httpKind(status: number, message: string): SyncErrorKind {
  if (status === 401) return SyncErrorKind.SignIn;
  if (status === 403)
    return RATE_LIMIT_RE.test(message) ? SyncErrorKind.Busy : SyncErrorKind.NoAccess;
  if (status === 404) return SyncErrorKind.NotFound;
  if (status === 429) return SyncErrorKind.Busy;
  if (status >= 500) return SyncErrorKind.ServiceDown;
  return SyncErrorKind.Unknown;
}

function errorKind(err: unknown): SyncErrorKind {
  if (err instanceof RemoteHttpError) return httpKind(err.status, err.message);
  if (err instanceof GoogleSignInError) return SyncErrorKind.SignIn;
  if (err instanceof TypeError && NETWORK_FAILURE_RE.test(err.message)) {
    return SyncErrorKind.Offline;
  }
  if (err instanceof SyntaxError || (err instanceof Error && err.name === "ZodError")) {
    return SyncErrorKind.BadData;
  }
  return SyncErrorKind.Unknown;
}

function errorDetail(err: unknown): string {
  if (err instanceof RemoteHttpError) return `HTTP ${err.status}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return err === undefined || err === null ? "" : String(err);
}

/** `online` is the browser's own view (`navigator.onLine`): offline wins over any error. */
export function describeSyncError(err: unknown, online = true): SyncProblem {
  return {
    kind: online ? errorKind(err) : SyncErrorKind.Offline,
    detail: errorDetail(err),
  };
}
