import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    globals: true,
    poolOptions: {
      workers: {
        // Use wrangler.toml config for the main worker being tested
        wrangler: { configPath: "./workers/capless-ingest/wrangler.toml" },
        // Note: Multi-worker testing requires pre-compiled JS files
        // For now, test one worker at a time by changing the wrangler configPath
      },
    },
  },
});
