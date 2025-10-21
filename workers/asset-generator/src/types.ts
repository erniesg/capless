import { z } from 'zod';

// Persona Types
export const PersonaSchema = z.enum(['gen_z', 'kopitiam_uncle', 'auntie', 'attenborough']);
export type Persona = z.infer<typeof PersonaSchema>;

export const PlatformSchema = z.enum(['tiktok', 'instagram', 'youtube']);
export type Platform = z.infer<typeof PlatformSchema>;

// Request Schemas
export const ScriptRequestSchema = z.object({
  moment_id: z.string(),
  personas: z.array(PersonaSchema).optional().default(['gen_z', 'kopitiam_uncle', 'auntie', 'attenborough']),
  platform: PlatformSchema.optional().default('tiktok'),
});
export type ScriptRequest = z.infer<typeof ScriptRequestSchema>;

export const AudioRequestSchema = z.object({
  script: z.string(),
  persona: PersonaSchema,
  speed: z.number().min(0.5).max(2.0).optional().default(1.0),
  emotion: z.string().optional().default('neutral'),
});
export type AudioRequest = z.infer<typeof AudioRequestSchema>;

export const ThumbnailRequestSchema = z.object({
  moment_id: z.string(),
  persona: PersonaSchema,
  template: z.string().optional().default('default'),
});
export type ThumbnailRequest = z.infer<typeof ThumbnailRequestSchema>;

export const FullAssetRequestSchema = z.object({
  moment_id: z.string(),
  platform: PlatformSchema.optional().default('tiktok'),
  auto_select: z.boolean().optional().default(true),
  selected_persona: PersonaSchema.optional(),
});
export type FullAssetRequest = z.infer<typeof FullAssetRequestSchema>;

// Response Types
export interface PersonaScript {
  persona: Persona;
  script: string;
  word_count: number;
  estimated_duration: number;
  persona_score: number;
}

export interface ScriptResponse {
  moment_id: string;
  scripts: PersonaScript[];
  generation_metadata: {
    model: string;
    generation_time_ms: number;
    total_tokens?: number;
  };
}

export interface AudioResponse {
  audio_url: string;
  duration: number;
  voice_id: string;
  waveform_data?: number[];
}

export interface ThumbnailResponse {
  thumbnail_url: string;
  dimensions: {
    width: number;
    height: number;
  };
}

export interface JudgingScore {
  persona: Persona;
  score: number;
  reasoning: string;
}

export interface FullAssetResponse {
  script: {
    persona: Persona;
    text: string;
    duration: number;
  };
  audio_url: string;
  thumbnail_url: string;
  all_scripts: Array<{
    persona: Persona;
    script: string;
    judge_score: number;
  }>;
  metadata: {
    winner_reason: string;
    judging_scores: JudgingScore[];
  };
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  timestamp: string;
  openai_available: boolean;
  elevenlabs_available: boolean;
  r2_available: boolean;
}

// Moment Type (from moments worker)
export interface Moment {
  moment_id: string;
  quote: string;
  speaker: string;
  topic: string;
  context: string;
  virality_score?: number;
  timestamp_start?: number;
  timestamp_end?: number;
  tags?: string[];
}

// Voice DNA Configuration
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

// Environment Bindings
export interface Env {
  // Secrets
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  ELEVENLABS_API_KEY: string;

  // Service Bindings
  MOMENTS: Fetcher;
  R2: R2Bucket;

  // Environment Variables
  ENVIRONMENT: string;
  OPENAI_MODEL: string;
  ANTHROPIC_MODEL: string;
  ELEVENLABS_MODEL: string;
  ELEVENLABS_VOICE_GEN_Z: string;
  ELEVENLABS_VOICE_UNCLE: string;
  ELEVENLABS_VOICE_AUNTIE: string;
  ELEVENLABS_VOICE_ATTENBOROUGH: string;
}

// Error Response
export interface ErrorResponse {
  error: string;
  details?: string;
  code?: string;
}
