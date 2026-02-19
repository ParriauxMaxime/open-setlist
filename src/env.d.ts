declare const __BASE_PATH__: string;

// rspack/webpack require.context
interface RequireContext {
  keys(): string[];
  <T = unknown>(key: string): T;
}

declare const require: {
  context(path: string, deep?: boolean, filter?: RegExp): RequireContext;
  (id: string): unknown;
};
