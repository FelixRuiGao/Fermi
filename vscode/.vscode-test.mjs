import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/test/**/*.test.cjs",
  workspaceFolder: "tests/fixture",
  mocha: {
    ui: "tdd",
    timeout: 20000,
  },
});
