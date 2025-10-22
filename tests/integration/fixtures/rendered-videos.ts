/**
 * Test fixtures for rendered videos and composition jobs
 * Used for video compositor integration tests
 */

import type {
  ComposeRequest,
  ComposeResponse,
  JobStatus,
  PublishRequest,
  PublishResponse,
} from '../../../workers/video-compositor/src/types/schemas';

/**
 * Sample compose requests
 */
export const TIKTOK_COMPOSE_REQUEST: ComposeRequest = {
  script: "Bruh, this Minister really said 'have his cake and eat it too' in Parliament. The shade is REAL.",
  audio_url: 'https://r2.cloudflare.com/capless/audio/moment-2024-07-02-001-gen_z.mp3',
  video_url: 'https://www.youtube.com/watch?v=parl-2024-07-02-abc&t=135',
  persona: 'gen_z',
  template: 'tiktok_parliamentary',
  effects: {
    captions: {
      enabled: true,
      style: 'word_by_word',
      font_size: 48,
    },
    transitions: {
      enabled: true,
      type: 'fade',
    },
    overlays: {
      persona_emoji: true,
      progress_bar: false,
    },
  },
  webhook_url: 'https://api.example.com/webhooks/video-complete',
  webhook_events: ['completed', 'failed'],
};

export const INSTAGRAM_COMPOSE_REQUEST: ComposeRequest = {
  script: "Wah lau eh, you see this Minister or not? Want to eat cake also want to keep cake.",
  audio_url: 'https://r2.cloudflare.com/capless/audio/moment-2024-07-02-001-uncle.mp3',
  video_url: 'https://www.youtube.com/watch?v=parl-2024-07-02-abc&t=135',
  persona: 'kopitiam_uncle',
  template: 'instagram_reels',
  effects: {
    captions: {
      enabled: true,
      style: 'sentence',
      font_size: 36,
    },
    transitions: {
      enabled: false,
    },
    overlays: {
      persona_emoji: false,
      progress_bar: true,
    },
  },
};

export const YOUTUBE_COMPOSE_REQUEST: ComposeRequest = {
  script: "Here, in the halls of Parliament, we observe a fascinating display of political theater.",
  audio_url: 'https://r2.cloudflare.com/capless/audio/moment-2024-07-02-001-attenborough.mp3',
  video_url: 'https://www.youtube.com/watch?v=parl-2024-07-02-abc&t=135',
  persona: 'attenborough',
  template: 'youtube_shorts',
  effects: {
    captions: {
      enabled: false,
    },
    transitions: {
      enabled: true,
      type: 'dissolve',
    },
  },
};

/**
 * Sample compose responses
 */
export const COMPOSE_RESPONSE_QUEUED: ComposeResponse = {
  job_id: 'job-2024-07-02-abc123',
  status: 'queued',
  estimated_completion: 120, // seconds
  modal_job_id: 'modal-job-xyz789',
};

/**
 * Sample job status responses at different stages
 */
export const JOB_STATUS_QUEUED: JobStatus = {
  job_id: 'job-2024-07-02-abc123',
  status: 'queued',
  progress: 0,
  created_at: Date.now() / 1000,
  updated_at: Date.now() / 1000,
};

export const JOB_STATUS_RENDERING_50: JobStatus = {
  job_id: 'job-2024-07-02-abc123',
  status: 'rendering',
  progress: 50,
  preview_url: 'https://r2.cloudflare.com/capless/previews/job-2024-07-02-abc123.jpg',
  created_at: Date.now() / 1000 - 60,
  updated_at: Date.now() / 1000,
};

export const JOB_STATUS_RENDERING_90: JobStatus = {
  job_id: 'job-2024-07-02-abc123',
  status: 'rendering',
  progress: 90,
  preview_url: 'https://r2.cloudflare.com/capless/previews/job-2024-07-02-abc123.jpg',
  created_at: Date.now() / 1000 - 100,
  updated_at: Date.now() / 1000,
};

export const JOB_STATUS_COMPLETED: JobStatus = {
  job_id: 'job-2024-07-02-abc123',
  status: 'completed',
  progress: 100,
  video_url: 'https://r2.cloudflare.com/capless/videos/job-2024-07-02-abc123.mp4',
  preview_url: 'https://r2.cloudflare.com/capless/previews/job-2024-07-02-abc123.jpg',
  created_at: Date.now() / 1000 - 120,
  updated_at: Date.now() / 1000,
};

export const JOB_STATUS_FAILED: JobStatus = {
  job_id: 'job-2024-07-02-abc123',
  status: 'failed',
  progress: 45,
  error: 'Video rendering failed: FFmpeg process terminated unexpectedly',
  retry_count: 2,
  created_at: Date.now() / 1000 - 30,
  updated_at: Date.now() / 1000,
};

/**
 * Publishing request fixtures
 */
export const PUBLISH_TIKTOK_REQUEST: PublishRequest = {
  video_url: 'https://r2.cloudflare.com/capless/videos/job-2024-07-02-abc123.mp4',
  platforms: ['tiktok'],
  metadata: {
    title: 'Minister Gets Called Out in Parliament 🔥',
    description: 'Opposition leader exposing the budget hypocrisy. No cap! #Singapore #Parliament #Politics',
    hashtags: ['Singapore', 'Parliament', 'Politics', 'Budget', 'Opposition'],
  },
};

export const PUBLISH_MULTI_PLATFORM_REQUEST: PublishRequest = {
  video_url: 'https://r2.cloudflare.com/capless/videos/job-2024-07-02-abc123.mp4',
  platforms: ['tiktok', 'instagram', 'youtube'],
  schedule: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  metadata: {
    title: 'Parliamentary Debate Highlights - Budget Controversy',
    description: 'Key moments from today\'s parliamentary session discussing budget allocation and fiscal responsibility.',
    hashtags: ['Singapore', 'Parliament', 'Budget2024', 'Politics'],
  },
};

/**
 * Publishing response fixtures
 */
export const PUBLISH_SUCCESS_RESPONSE: PublishResponse = {
  published: 1,
  failed: 0,
  results: [
    {
      platform: 'tiktok',
      success: true,
      url: 'https://tiktok.com/@parliament_sg/video/1234567890',
      post_id: 'tiktok-1234567890',
    },
  ],
};

export const PUBLISH_MULTI_SUCCESS_RESPONSE: PublishResponse = {
  published: 3,
  failed: 0,
  results: [
    {
      platform: 'tiktok',
      success: true,
      url: 'https://tiktok.com/@parliament_sg/video/1234567890',
      post_id: 'tiktok-1234567890',
    },
    {
      platform: 'instagram',
      success: true,
      url: 'https://instagram.com/p/ABC123DEF456',
      post_id: 'instagram-ABC123DEF456',
    },
    {
      platform: 'youtube',
      success: true,
      url: 'https://youtube.com/shorts/XYZ789',
      post_id: 'youtube-XYZ789',
    },
  ],
};

export const PUBLISH_PARTIAL_FAILURE_RESPONSE: PublishResponse = {
  published: 2,
  failed: 1,
  results: [
    {
      platform: 'tiktok',
      success: true,
      url: 'https://tiktok.com/@parliament_sg/video/1234567890',
      post_id: 'tiktok-1234567890',
    },
    {
      platform: 'instagram',
      success: true,
      url: 'https://instagram.com/p/ABC123DEF456',
      post_id: 'instagram-ABC123DEF456',
    },
    {
      platform: 'youtube',
      success: false,
      error: 'YouTube API quota exceeded',
    },
  ],
};

export const PUBLISH_SCHEDULED_RESPONSE: PublishResponse = {
  published: 0,
  failed: 0,
  results: [],
  scheduled: true,
  publish_at: Math.floor(Date.now() / 1000) + 3600,
  job_id: 'scheduled-job-abc123',
};

/**
 * Sample job IDs
 */
export const JOB_IDS = {
  tiktok: 'job-2024-07-02-tiktok-abc',
  instagram: 'job-2024-07-02-insta-def',
  youtube: 'job-2024-07-02-yt-ghi',
  failed: 'job-2024-07-02-failed-xyz',
};

/**
 * Sample video URLs
 */
export const VIDEO_URLS = {
  completed: 'https://r2.cloudflare.com/capless/videos/job-2024-07-02-abc123.mp4',
  preview: 'https://r2.cloudflare.com/capless/previews/job-2024-07-02-abc123.jpg',
  youtube_source: 'https://www.youtube.com/watch?v=parl-2024-07-02-abc&t=135',
};

/**
 * Helper to create a compose request
 */
export function createComposeRequest(options: {
  persona: 'gen_z' | 'kopitiam_uncle' | 'auntie' | 'attenborough';
  template: 'tiktok_parliamentary' | 'instagram_reels' | 'youtube_shorts';
  script: string;
  audioUrl: string;
  videoUrl: string;
}): ComposeRequest {
  return {
    script: options.script,
    audio_url: options.audioUrl,
    video_url: options.videoUrl,
    persona: options.persona,
    template: options.template,
  };
}

/**
 * Helper to create a job status
 */
export function createJobStatus(
  jobId: string,
  status: 'queued' | 'rendering' | 'completed' | 'failed',
  progress: number,
  videoUrl?: string,
  error?: string
): JobStatus {
  const now = Math.floor(Date.now() / 1000);
  return {
    job_id: jobId,
    status,
    progress,
    video_url: videoUrl,
    error,
    created_at: now - 120,
    updated_at: now,
  };
}

/**
 * Progressive job status sequence (for polling tests)
 */
export function createProgressiveJobStatuses(jobId: string, success: boolean = true): JobStatus[] {
  const now = Math.floor(Date.now() / 1000);
  const statuses: JobStatus[] = [
    {
      job_id: jobId,
      status: 'queued',
      progress: 0,
      created_at: now,
      updated_at: now,
    },
    {
      job_id: jobId,
      status: 'rendering',
      progress: 25,
      created_at: now,
      updated_at: now + 30,
    },
    {
      job_id: jobId,
      status: 'rendering',
      progress: 50,
      preview_url: `https://r2.cloudflare.com/capless/previews/${jobId}.jpg`,
      created_at: now,
      updated_at: now + 60,
    },
    {
      job_id: jobId,
      status: 'rendering',
      progress: 75,
      preview_url: `https://r2.cloudflare.com/capless/previews/${jobId}.jpg`,
      created_at: now,
      updated_at: now + 90,
    },
  ];

  if (success) {
    statuses.push({
      job_id: jobId,
      status: 'completed',
      progress: 100,
      video_url: `https://r2.cloudflare.com/capless/videos/${jobId}.mp4`,
      preview_url: `https://r2.cloudflare.com/capless/previews/${jobId}.jpg`,
      created_at: now,
      updated_at: now + 120,
    });
  } else {
    statuses.push({
      job_id: jobId,
      status: 'failed',
      progress: 75,
      error: 'Video rendering failed: FFmpeg process terminated unexpectedly',
      retry_count: 2,
      created_at: now,
      updated_at: now + 100,
    });
  }

  return statuses;
}

/**
 * Cleanup request fixtures
 */
export const CLEANUP_REQUEST_DRY_RUN = {
  older_than: Date.now() / 1000 - 86400 * 7, // 7 days ago
  pattern: 'renders/*',
  dry_run: true,
};

export const CLEANUP_REQUEST_EXECUTE = {
  older_than: Date.now() / 1000 - 86400 * 7,
  pattern: 'renders/*',
  dry_run: false,
};

/**
 * Cleanup response fixtures
 */
export const CLEANUP_RESPONSE_DRY_RUN = {
  deleted_count: 0,
  freed_space_mb: 0,
  deleted_files: [],
  would_delete_count: 15,
};

export const CLEANUP_RESPONSE_EXECUTED = {
  deleted_count: 15,
  freed_space_mb: 2458.7,
  deleted_files: [
    'renders/job-2024-06-25-abc.mp4',
    'renders/job-2024-06-26-def.mp4',
    // ... more files
  ],
};
