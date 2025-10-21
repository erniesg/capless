import { z } from 'zod';

// Video composition request schema
export const VideoEffectsSchema = z.object({
  captions: z.object({
    enabled: z.boolean(),
    style: z.enum(['word_by_word', 'sentence', 'none']).optional(),
    font_size: z.number().min(12).max(72).optional()
  }).optional(),
  transitions: z.object({
    enabled: z.boolean(),
    type: z.enum(['fade', 'cut', 'wipe', 'dissolve']).optional()
  }).optional(),
  overlays: z.object({
    persona_emoji: z.boolean().optional(),
    progress_bar: z.boolean().optional()
  }).optional()
});

export const ComposeRequestSchema = z.object({
  script: z.string().min(1, 'Script is required'),
  audio_url: z.string().url('Invalid audio URL'),
  video_url: z.string().url('Invalid video URL'),
  persona: z.enum(['gen_z', 'kopitiam_uncle', 'auntie', 'attenborough']),
  template: z.enum(['tiktok_parliamentary', 'instagram_reels', 'youtube_shorts']).default('tiktok_parliamentary'),
  effects: VideoEffectsSchema.optional(),
  webhook_url: z.string().url().optional(),
  webhook_events: z.array(z.enum(['completed', 'failed', 'progress'])).optional()
});

export type ComposeRequest = z.infer<typeof ComposeRequestSchema>;
export type VideoEffects = z.infer<typeof VideoEffectsSchema>;

// Video composition response schema
export const ComposeResponseSchema = z.object({
  job_id: z.string(),
  status: z.enum(['queued', 'rendering', 'completed', 'failed']),
  estimated_completion: z.number(),
  modal_job_id: z.string()
});

export type ComposeResponse = z.infer<typeof ComposeResponseSchema>;

// Job status response schema
export const JobStatusSchema = z.object({
  job_id: z.string(),
  status: z.enum(['queued', 'rendering', 'completed', 'failed']),
  progress: z.number().min(0).max(100),
  video_url: z.string().url().optional(),
  preview_url: z.string().url().optional(),
  error: z.string().optional(),
  retry_count: z.number().optional(),
  created_at: z.number(),
  updated_at: z.number()
});

export type JobStatus = z.infer<typeof JobStatusSchema>;

// Publishing request schema
export const PublishMetadataSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  hashtags: z.array(z.string())
});

export const PublishRequestSchema = z.object({
  video_url: z.string().url('Invalid video URL'),
  platforms: z.array(z.enum(['tiktok', 'instagram', 'youtube'])).min(1, 'At least one platform required'),
  schedule: z.number().optional(),
  metadata: PublishMetadataSchema
});

export type PublishRequest = z.infer<typeof PublishRequestSchema>;
export type PublishMetadata = z.infer<typeof PublishMetadataSchema>;

// Publishing response schema
export const PlatformResultSchema = z.object({
  platform: z.enum(['tiktok', 'instagram', 'youtube']),
  success: z.boolean(),
  url: z.string().url().optional(),
  post_id: z.string().optional(),
  error: z.string().optional()
});

export const PublishResponseSchema = z.object({
  published: z.number(),
  failed: z.number(),
  results: z.array(PlatformResultSchema),
  scheduled: z.boolean().optional(),
  publish_at: z.number().optional(),
  job_id: z.string().optional()
});

export type PlatformResult = z.infer<typeof PlatformResultSchema>;
export type PublishResponse = z.infer<typeof PublishResponseSchema>;

// Cleanup request schema
export const CleanupRequestSchema = z.object({
  older_than: z.number(),
  pattern: z.string().default('renders/*'),
  dry_run: z.boolean().default(false)
});

export type CleanupRequest = z.infer<typeof CleanupRequestSchema>;

// Cleanup response schema
export const CleanupResponseSchema = z.object({
  deleted_count: z.number(),
  freed_space_mb: z.number(),
  deleted_files: z.array(z.string()),
  would_delete_count: z.number().optional()
});

export type CleanupResponse = z.infer<typeof CleanupResponseSchema>;

// Modal API schemas
export const ModalJobRequestSchema = z.object({
  script: z.string(),
  audio_url: z.string().url(),
  video_url: z.string().url(),
  persona: z.string(),
  template: z.string(),
  effects: z.any().optional()
});

export const ModalJobResponseSchema = z.object({
  job_id: z.string(),
  status: z.string(),
  estimated_duration: z.number()
});

export const ModalStatusResponseSchema = z.object({
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  progress: z.number().min(0).max(100),
  video_url: z.string().url().optional(),
  error: z.string().optional()
});

export type ModalJobRequest = z.infer<typeof ModalJobRequestSchema>;
export type ModalJobResponse = z.infer<typeof ModalJobResponseSchema>;
export type ModalStatusResponse = z.infer<typeof ModalStatusResponseSchema>;

// Health check response schema
export const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  service: z.string(),
  timestamp: z.string(),
  modal_available: z.boolean(),
  r2_available: z.boolean(),
  tiktok_api_available: z.boolean(),
  instagram_api_available: z.boolean(),
  youtube_api_available: z.boolean()
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// Error response schema
export const ErrorResponseSchema = z.object({
  error: z.string(),
  details: z.any().optional()
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
