import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          // Provide mock KV namespace for testing
          kvNamespaces: ['VIDEO_JOBS'],
        },
      },
    },
  },
});
