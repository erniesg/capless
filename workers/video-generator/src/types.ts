import { z } from 'zod';

/**
 * Environment bindings
 */
export interface Env {
  R2: R2Bucket;
  VIDEO_JOBS: KVNamespace;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  REPLICATE_API_TOKEN?: string;
  DEMO_MODE?: string | boolean;
  USE_VEO?: string | boolean;
}

/**
 * Persona types
 */
export type Persona = 'gen_z' | 'kopitiam_uncle' | 'auntie' | 'attenborough' | 'ai_decide';

/**
 * Moment from moments worker
 */
export interface Moment {
  moment_id: string;
  quote: string;
  speaker: string;
  timestamp_start: string;
  timestamp_end: string;
  virality_score: number;
  why_viral: string;
  topic: string;
  emotional_tone: string;
  target_demographic: string;
  transcript_id: string;
}

/**
 * Voice DNA configuration
 */
export interface VoiceDNA {
  persona: Persona;
  archetype: string;
  driving_force: string;
  worldview: string;
  voice_id: string;
  system_prompt: string;
  example_phrases: string[];
  validation_markers: string[];
}

/**
 * Generated script
 */
export interface GeneratedScript {
  persona: Persona;
  script: string;
  hook: string;
  cta: string;
  hashtags: string[];
  word_count: number;
  validation_score: number;
}

/**
 * Video generation request schema
 */
export const VideoGenerationRequestSchema = z.object({
  moment_id: z.string().min(1),
  persona: z.enum(['gen_z', 'kopitiam_uncle', 'auntie', 'attenborough', 'ai_decide']),
  session_id: z.string().optional(),
});

export type VideoGenerationRequest = z.infer<typeof VideoGenerationRequestSchema>;

/**
 * Video job status
 */
export type VideoJobStatus = 'processing' | 'completed' | 'failed' | 'error';

/**
 * Video job
 */
export interface VideoJob {
  job_id: string;
  status: VideoJobStatus;
  request: VideoGenerationRequest;
  moment?: Moment;
  scripts?: GeneratedScript[];
  selected_persona?: Persona;
  judge_reasoning?: string;
  sora_generation_id?: string;
  video_url?: string;
  youtube_link?: string;
  youtube_timestamp?: string;
  created_at: string;
  completed_at?: string;
  error?: string;
}

/**
 * API Response types
 */
export interface VideoGenerationResponse {
  job_id: string;
  status: VideoJobStatus;
  estimated_time_seconds: number;
  poll_url: string;
}

export interface VideoStatusResponse extends VideoJob {
  progress?: string;
}
