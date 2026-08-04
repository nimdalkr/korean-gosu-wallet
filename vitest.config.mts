import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/lib/activity-classifier.ts", "src/lib/blockscout.ts", "src/lib/snapshot.ts"],
    },
  },
});
