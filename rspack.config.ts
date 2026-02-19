import path from "node:path";
import { defineConfig } from "@rspack/cli";
import { rspack } from "@rspack/core";
import RefreshPlugin from "@rspack/plugin-react-refresh";

export default defineConfig((_env, argv) => {
  const isDev = argv.mode === "development" || process.env.NODE_ENV === "development";

  return {
    mode: isDev ? "development" : "production",
    entry: { main: "./src/main.tsx" },
    output: {
      filename: isDev ? "assets/[name].js" : "assets/[name].[contenthash:8].js",
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
        templateParameters: {
          basePath: process.env.BASE_PATH || "/",
        },
      }),
      new rspack.CopyRspackPlugin({
        patterns: [
          { from: "public/manifest.json", to: "manifest.json" },
          { from: "public/sw.js", to: "sw.js" },
          { from: "public/icons", to: "icons" },
        ],
      }),
      new rspack.DefinePlugin({
        __BASE_PATH__: JSON.stringify(process.env.BASE_PATH || "/"),
      }),
      isDev && new RefreshPlugin(),
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
