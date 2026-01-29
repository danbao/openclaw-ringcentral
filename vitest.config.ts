import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "clawdbot/plugin-sdk": resolve(__dirname, "node_modules/clawdbot/dist/plugin-sdk/index.js"),
    },
  },
});
