/**
 * Mock factory for Modal API responses
 * Matches Modal's serverless function invocation patterns
 */

import { z } from 'zod';

// ============================================================================
// Modal API Response Schemas
// ============================================================================

export const ModalJobRequestSchema = z.object({
  script: z.string(),
  audio_url: z.string().url(),
  video_url: z.string().url(),
  persona: z.string(),
  template: z.string(),
  effects: z.any().optional(),
});

export const ModalJobResponseSchema = z.object({
  job_id: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  estimated_duration: z.number(), // seconds
  created_at: z.number(),
});

export const ModalStatusResponseSchema = z.object({
  job_id: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  progress: z.number().min(0).max(100),
  video_url: z.string().url().optional(),
  preview_url: z.string().url().optional(),
  error: z.string().optional(),
  started_at: z.number().optional(),
  completed_at: z.number().optional(),
  duration_seconds: z.number().optional(),
});

export const ModalWebhookPayloadSchema = z.object({
  job_id: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  progress: z.number(),
  video_url: z.string().url().optional(),
  error: z.string().optional(),
  metadata: z.any().optional(),
});

export type ModalJobRequest = z.infer<typeof ModalJobRequestSchema>;
export type ModalJobResponse = z.infer<typeof ModalJobResponseSchema>;
export type ModalStatusResponse = z.infer<typeof ModalStatusResponseSchema>;
export type ModalWebhookPayload = z.infer<typeof ModalWebhookPayloadSchema>;

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Create a mock job submission response
 */
export function createModalJobResponse(
  estimatedDurationSeconds: number = 120
): ModalJobResponse {
  return {
    job_id: `modal-job-${Math.random().toString(36).substring(2, 15)}`,
    status: 'queued',
    estimated_duration: estimatedDurationSeconds,
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Create a mock job status response at different stages
 */
export function createModalStatusResponse(
  jobId: string,
  stage: 'queued' | 'running' | 'completed' | 'failed',
  options?: {
    progress?: number;
    videoUrl?: string;
    previewUrl?: string;
    error?: string;
  }
): ModalStatusResponse {
  const now = Math.floor(Date.now() / 1000);
  const baseResponse: ModalStatusResponse = {
    job_id: jobId,
    status: stage,
    progress: options?.progress ?? 0,
  };

  switch (stage) {
    case 'queued':
      return {
        ...baseResponse,
        progress: 0,
        started_at: now,
      };

    case 'running':
      return {
        ...baseResponse,
        progress: options?.progress ?? 50,
        started_at: now - 60,
        preview_url: options?.previewUrl,
      };

    case 'completed':
      return {
        ...baseResponse,
        progress: 100,
        video_url: options?.videoUrl ?? `https://storage.modal.com/videos/${jobId}.mp4`,
        preview_url: options?.previewUrl ?? `https://storage.modal.com/previews/${jobId}.jpg`,
        started_at: now - 120,
        completed_at: now,
        duration_seconds: 120,
      };

    case 'failed':
      return {
        ...baseResponse,
        progress: options?.progress ?? 0,
        error: options?.error ?? 'Video rendering failed due to invalid input',
        started_at: now - 30,
        completed_at: now,
      };
  }
}

/**
 * Create a mock webhook payload
 */
export function createModalWebhookPayload(
  jobId: string,
  status: 'queued' | 'running' | 'completed' | 'failed',
  options?: {
    progress?: number;
    videoUrl?: string;
    error?: string;
    metadata?: any;
  }
): ModalWebhookPayload {
  return {
    job_id: jobId,
    status,
    progress: options?.progress ?? (status === 'completed' ? 100 : 0),
    video_url: options?.videoUrl,
    error: options?.error,
    metadata: options?.metadata,
  };
}

/**
 * Create a mock error response
 */
export function createModalErrorResponse(
  message: string,
  status: number = 500
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      status: 'error',
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Simulate a progressive job status sequence
 * Returns an array of status responses over time
 */
export function createProgressiveJobStatuses(
  jobId: string,
  totalSteps: number = 5,
  success: boolean = true
): ModalStatusResponse[] {
  const statuses: ModalStatusResponse[] = [];
  const now = Math.floor(Date.now() / 1000);

  // Queued
  statuses.push({
    job_id: jobId,
    status: 'queued',
    progress: 0,
    started_at: now,
  });

  // Running with progressive updates
  for (let i = 1; i < totalSteps; i++) {
    statuses.push({
      job_id: jobId,
      status: 'running',
      progress: Math.floor((i / totalSteps) * 100),
      started_at: now + i * 10,
      preview_url: `https://storage.modal.com/previews/${jobId}.jpg`,
    });
  }

  // Final status
  if (success) {
    statuses.push({
      job_id: jobId,
      status: 'completed',
      progress: 100,
      video_url: `https://storage.modal.com/videos/${jobId}.mp4`,
      preview_url: `https://storage.modal.com/previews/${jobId}.jpg`,
      started_at: now,
      completed_at: now + totalSteps * 10,
      duration_seconds: totalSteps * 10,
    });
  } else {
    statuses.push({
      job_id: jobId,
      status: 'failed',
      progress: Math.floor((totalSteps / 2) * 100),
      error: 'Video rendering failed: FFmpeg process terminated unexpectedly',
      started_at: now,
      completed_at: now + (totalSteps / 2) * 10,
    });
  }

  return statuses;
}

// ============================================================================
// Fixture Data
// ============================================================================

/**
 * Sample Modal job requests
 */
export const MODAL_JOB_FIXTURES = {
  tiktok_parliamentary: {
    script: "Bruh, this Minister really said 'have his cake and eat it too' in Parliament.",
    audio_url: 'https://r2.cloudflare.com/audio/gen_z_moment_123.mp3',
    video_url: 'https://youtube.com/watch?v=parliament_session',
    persona: 'gen_z',
    template: 'tiktok_parliamentary',
    effects: {
      captions: { enabled: true, style: 'word_by_word', font_size: 48 },
      transitions: { enabled: true, type: 'fade' },
      overlays: { persona_emoji: true, progress_bar: false },
    },
  },
  instagram_reels: {
    script: "Wah lau eh, you see this Minister or not? Want to eat cake also want to keep cake.",
    audio_url: 'https://r2.cloudflare.com/audio/uncle_moment_456.mp3',
    video_url: 'https://youtube.com/watch?v=parliament_session',
    persona: 'kopitiam_uncle',
    template: 'instagram_reels',
    effects: {
      captions: { enabled: true, style: 'sentence', font_size: 36 },
      transitions: { enabled: false },
      overlays: { persona_emoji: false, progress_bar: true },
    },
  },
  youtube_shorts: {
    script: "Here, in the halls of Parliament, we observe a fascinating display.",
    audio_url: 'https://r2.cloudflare.com/audio/attenborough_moment_789.mp3',
    video_url: 'https://youtube.com/watch?v=parliament_session',
    persona: 'attenborough',
    template: 'youtube_shorts',
    effects: {
      captions: { enabled: false },
      transitions: { enabled: true, type: 'dissolve' },
      overlays: { persona_emoji: false, progress_bar: false },
    },
  },
};

/**
 * Sample job IDs for testing
 */
export const SAMPLE_JOB_IDS = [
  'modal-job-abc123def456',
  'modal-job-xyz789ghi012',
  'modal-job-jkl345mno678',
];

/**
 * Helper to estimate video rendering time based on template
 */
export function estimateRenderingTime(template: string): number {
  const baseTime = 60; // 60 seconds base
  const templateMultipliers: Record<string, number> = {
    'tiktok_parliamentary': 1.5, // More effects
    'instagram_reels': 1.2,
    'youtube_shorts': 1.0, // Simpler
  };

  return Math.ceil(baseTime * (templateMultipliers[template] ?? 1.0));
}
