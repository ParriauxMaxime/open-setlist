import { createHash } from "node:crypto";
import path from "node:path";
import { defineConfig } from "@rspack/cli";
import { type Compiler, rspack } from "@rspack/core";
import RefreshPlugin from "@rspack/plugin-react-refresh";
import { config as loadEnv } from "dotenv";
import {
  type PrecacheManifest,
  SW_FILENAME,
  selectPrecacheAssets,
} from "./src/domain/pwa/precache";

loadEnv();

/**
 * Prepends the precache manifest (every emitted asset + a per-build version) to sw.js.
 * Runs after minification and HTML/copy emission so the list is final. URLs are relative
 * to the SW scope, so BASE_PATH is respected without being baked in.
 */
class PrecacheManifestPlugin {
  apply(compiler: Compiler) {
    const { Compilation, sources } = compiler.webpack;
    compiler.hooks.thisCompilation.tap("PrecacheManifestPlugin", (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: "PrecacheManifestPlugin",
          stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER,
        },
        () => {
          const swAsset = compilation.getAsset(SW_FILENAME);
          if (!swAsset) return;

          const urls = selectPrecacheAssets(compilation.getAssets().map((asset) => asset.name));
          // Version covers every precached file and the SW code itself, so any change to
          // either produces a new cache name and a byte-different sw.js.
          const hash = createHash("sha256");
          for (const name of [...urls, SW_FILENAME]) {
            hash.update(name);
            hash.update(compilation.getAsset(name)?.source.buffer() ?? "");
          }
          const manifest: PrecacheManifest = { version: hash.digest("hex").slice(0, 12), urls };

          compilation.updateAsset(
            SW_FILENAME,
            new sources.ConcatSource(
              `self.__PRECACHE_MANIFEST__=${JSON.stringify(manifest)};\n`,
              swAsset.source,
            ),
          );
        },
      );
    });
  }
}

export default defineConfig((_env, argv) => {
  const isDev = argv.mode === "development" || process.env.NODE_ENV === "development";

  return {
    mode: isDev ? "development" : "production",
    // No service worker in dev (main.tsx unregisters it).
    entry: isDev ? { main: "./src/main.tsx" } : { main: "./src/main.tsx", sw: "./src/sw.ts" },
    output: {
      // sw.js needs a stable, unhashed URL at the app root.
      filename: (pathData) =>
        pathData.chunk?.name === "sw"
          ? SW_FILENAME
          : isDev
            ? "assets/[name].js"
            : "assets/[name].[contenthash:8].js",
      cssFilename: isDev ? "assets/[name].css" : "assets/[name].[contenthash:8].css",
      publicPath: process.env.BASE_PATH || "/",
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      alias: {
        "@domain": path.resolve(__dirname, "src/domain"),
        "@db": path.resolve(__dirname, "src/db"),
        "@i18n": path.resolve(__dirname, "src/i18n"),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: "builtin:swc-loader",
            options: {
              jsc: {
                parser: { syntax: "typescript", tsx: true },
                transform: {
                  react: { runtime: "automatic", development: isDev, refresh: isDev },
                },
              },
            },
          },
        },
        {
          test: /\.chopro$/,
          type: "asset/source",
        },
        {
          test: /\.css$/,
          use: ["postcss-loader"],
          type: "css/auto",
        },
      ],
    },
    plugins: [
      new rspack.HtmlRspackPlugin({
        template: "./public/index.html",
        chunks: ["main"],
        templateParameters: {
          basePath: process.env.BASE_PATH || "/",
        },
      }),
      new rspack.CopyRspackPlugin({
        patterns: [
          { from: "public/manifest.json", to: "manifest.json" },
          { from: "public/icons", to: "icons" },
        ],
      }),
      new rspack.DefinePlugin({
        __BASE_PATH__: JSON.stringify(process.env.BASE_PATH || "/"),
        __GOOGLE_CLIENT_ID__: JSON.stringify(process.env.GOOGLE_CLIENT_ID || ""),
      }),
      isDev && new RefreshPlugin(),
      !isDev && new PrecacheManifestPlugin(),
    ].filter(Boolean),
    experiments: {
      css: true,
    },
    devServer: {
      port: 3000,
      hot: true,
      historyApiFallback: true,
    },
  };
});
