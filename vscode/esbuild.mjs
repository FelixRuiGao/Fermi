import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

/** Extension host bundle (Node.js) */
const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: "out/extension.js",
  format: "cjs",
  external: ["vscode"],
  sourcemap: true,
  minify: !isWatch,
};

/** Webview bundle (browser) */
const webviewConfig = {
  entryPoints: ["webview/index.tsx"],
  bundle: true,
  platform: "browser",
  target: "es2022",
  outfile: "out/webview.js",
  format: "iife",
  sourcemap: true,
  minify: !isWatch,
  define: {
    "process.env.NODE_ENV": isWatch ? '"development"' : '"production"',
  },
  loader: {
    ".css": "text",
  },
};

if (isWatch) {
  const extCtx = await esbuild.context(extensionConfig);
  const webCtx = await esbuild.context(webviewConfig);
  await Promise.all([extCtx.watch(), webCtx.watch()]);
  console.log("Watching for changes...");
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(webviewConfig),
  ]);
  console.log("Build complete.");
}
