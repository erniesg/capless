export interface Env {
  // R2 Storage
  R2: R2Bucket;

  // Durable Object binding
  RENDER_JOB_TRACKER: DurableObjectNamespace;

  // API Keys (secrets)
  MODAL_API_KEY: string;
  TIKTOK_ACCESS_TOKEN: string;
  INSTAGRAM_ACCESS_TOKEN: string;
  YOUTUBE_API_KEY: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;

  // Environment variables
  ENVIRONMENT: string;
  MODAL_ENDPOINT: string;
  MODAL_POLL_INTERVAL_MS: string;
  MODAL_MAX_RETRIES: string;
  MODAL_TIMEOUT_MS: string;
  R2_CLEANUP_DAYS: string;
  R2_PUBLIC_URL: string;
}
