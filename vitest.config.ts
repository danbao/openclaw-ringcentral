import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "openclaw/plugin-sdk": resolve(__dirname, "node_modules/openclaw/dist/plugin-sdk/index.js"),
    },
  },
});
