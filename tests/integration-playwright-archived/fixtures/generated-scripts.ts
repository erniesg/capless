/**
 * Test fixtures for AI-generated scripts and audio assets
 * Used for asset generator integration tests
 */

import type {
  PersonaScript,
  ScriptResponse,
  AudioResponse,
  ThumbnailResponse,
  FullAssetResponse
} from '../../../workers/asset-generator/src/types';

/**
 * Gen Z persona script
 */
export const GEN_Z_SCRIPT: PersonaScript = {
  persona: 'gen_z',
  script: "Bruh, this Minister really said 'have his cake and eat it too' in Parliament. The shade is REAL. Opposition leader came through with the facts, no cap. Budget debate getting spicy 🔥",
  word_count: 31,
  estimated_duration: 12.4, // seconds
  persona_score: 9.2,
};

/**
 * Kopitiam Uncle persona script
 */
export const UNCLE_SCRIPT: PersonaScript = {
  persona: 'kopitiam_uncle',
  script: "Wah lau eh, you see this Minister or not? Want to eat cake also want to keep cake. Opposition leader very clever lah, catch him red-handed. Like that how to trust the budget?",
  word_count: 32,
  estimated_duration: 13.0,
  persona_score: 7.8,
};

/**
 * Auntie persona script
 */
export const AUNTIE_SCRIPT: PersonaScript = {
  persona: 'auntie',
  script: "Aiyoh, this Minister ah, very greedy leh. Want everything also must have. The Opposition leader right lah, cannot like that. Budget must be fair, not only benefit some people.",
  word_count: 30,
  estimated_duration: 12.8,
  persona_score: 7.5,
};

/**
 * Attenborough persona script
 */
export const ATTENBOROUGH_SCRIPT: PersonaScript = {
  persona: 'attenborough',
  script: "Here, in the halls of Parliament, we observe a fascinating display of political theater. The Opposition leader, with surgical precision, exposes what he perceives as governmental hypocrisy.",
  word_count: 28,
  estimated_duration: 14.5,
  persona_score: 6.9,
};

/**
 * Complete script generation response
 */
export const SCRIPT_GENERATION_RESPONSE: ScriptResponse = {
  moment_id: 'moment-2024-07-02-001',
  scripts: [
    GEN_Z_SCRIPT,
    UNCLE_SCRIPT,
    AUNTIE_SCRIPT,
    ATTENBOROUGH_SCRIPT,
  ],
  generation_metadata: {
    model: 'gpt-4o-2024-08-06',
    generation_time_ms: 2340,
    total_tokens: 1850,
  },
};

/**
 * Audio response fixtures
 */
export const GEN_Z_AUDIO: AudioResponse = {
  audio_url: 'https://r2.cloudflare.com/capless/audio/moment-2024-07-02-001-gen_z.mp3',
  duration: 12.4,
  voice_id: 'voice_gen_z_energetic_123',
  waveform_data: Array.from({ length: 100 }, (_, i) => Math.sin(i / 10) * 0.5),
};

export const UNCLE_AUDIO: AudioResponse = {
  audio_url: 'https://r2.cloudflare.com/capless/audio/moment-2024-07-02-001-uncle.mp3',
  duration: 13.0,
  voice_id: 'voice_uncle_singlish_456',
  waveform_data: Array.from({ length: 100 }, (_, i) => Math.sin(i / 8) * 0.6),
};

export const AUNTIE_AUDIO: AudioResponse = {
  audio_url: 'https://r2.cloudflare.com/capless/audio/moment-2024-07-02-001-auntie.mp3',
  duration: 12.8,
  voice_id: 'voice_auntie_warm_789',
  waveform_data: Array.from({ length: 100 }, (_, i) => Math.sin(i / 9) * 0.55),
};

export const ATTENBOROUGH_AUDIO: AudioResponse = {
  audio_url: 'https://r2.cloudflare.com/capless/audio/moment-2024-07-02-001-attenborough.mp3',
  duration: 14.5,
  voice_id: 'voice_attenborough_narrator_012',
  waveform_data: Array.from({ length: 100 }, (_, i) => Math.sin(i / 12) * 0.4),
};

/**
 * Thumbnail response fixtures
 */
export const GEN_Z_THUMBNAIL: ThumbnailResponse = {
  thumbnail_url: 'https://r2.cloudflare.com/capless/thumbnails/moment-2024-07-02-001-gen_z.jpg',
  dimensions: {
    width: 1080,
    height: 1920, // 9:16 TikTok format
  },
};

export const UNCLE_THUMBNAIL: ThumbnailResponse = {
  thumbnail_url: 'https://r2.cloudflare.com/capless/thumbnails/moment-2024-07-02-001-uncle.jpg',
  dimensions: {
    width: 1080,
    height: 1920,
  },
};

/**
 * Full asset response (winner selected)
 */
export const FULL_ASSET_RESPONSE: FullAssetResponse = {
  script: {
    persona: 'gen_z',
    text: GEN_Z_SCRIPT.script,
    duration: GEN_Z_SCRIPT.estimated_duration,
  },
  audio_url: GEN_Z_AUDIO.audio_url,
  thumbnail_url: GEN_Z_THUMBNAIL.thumbnail_url,
  all_scripts: [
    {
      persona: 'gen_z',
      script: GEN_Z_SCRIPT.script,
      judge_score: 9.2,
    },
    {
      persona: 'kopitiam_uncle',
      script: UNCLE_SCRIPT.script,
      judge_score: 7.8,
    },
    {
      persona: 'auntie',
      script: AUNTIE_SCRIPT.script,
      judge_score: 7.5,
    },
    {
      persona: 'attenborough',
      script: ATTENBOROUGH_SCRIPT.script,
      judge_score: 6.9,
    },
  ],
  metadata: {
    winner_reason: 'Gen Z version has highest viral potential with authentic slang usage, emoji deployment, and captures confrontational energy that resonates on TikTok',
    judging_scores: [
      {
        persona: 'gen_z',
        score: 9.2,
        reasoning: 'Perfect TikTok format, authentic voice, high engagement potential',
      },
      {
        persona: 'kopitiam_uncle',
        score: 7.8,
        reasoning: 'Strong local appeal but limited international reach',
      },
      {
        persona: 'auntie',
        score: 7.5,
        reasoning: 'Relatable but less shareable than Gen Z version',
      },
      {
        persona: 'attenborough',
        score: 6.9,
        reasoning: 'Entertaining but may be too niche for viral spread',
      },
    ],
  },
};

/**
 * API request fixtures
 */
export const SCRIPT_REQUEST_FIXTURES = {
  all_personas: {
    moment_id: 'moment-2024-07-02-001',
    personas: ['gen_z', 'kopitiam_uncle', 'auntie', 'attenborough'] as const,
    platform: 'tiktok' as const,
  },
  single_persona: {
    moment_id: 'moment-2024-07-02-001',
    personas: ['gen_z'] as const,
    platform: 'tiktok' as const,
  },
  instagram_platform: {
    moment_id: 'moment-2024-07-02-002',
    personas: ['auntie', 'kopitiam_uncle'] as const,
    platform: 'instagram' as const,
  },
};

export const AUDIO_REQUEST_FIXTURES = {
  gen_z_default: {
    script: GEN_Z_SCRIPT.script,
    persona: 'gen_z' as const,
    speed: 1.0,
    emotion: 'neutral',
  },
  uncle_fast: {
    script: UNCLE_SCRIPT.script,
    persona: 'kopitiam_uncle' as const,
    speed: 1.2,
    emotion: 'excited',
  },
  auntie_slow: {
    script: AUNTIE_SCRIPT.script,
    persona: 'auntie' as const,
    speed: 0.9,
    emotion: 'concerned',
  },
};

export const THUMBNAIL_REQUEST_FIXTURES = {
  default_template: {
    moment_id: 'moment-2024-07-02-001',
    persona: 'gen_z' as const,
    template: 'default',
  },
  debate_template: {
    moment_id: 'moment-2024-07-02-001',
    persona: 'kopitiam_uncle' as const,
    template: 'debate',
  },
};

export const FULL_ASSET_REQUEST_FIXTURES = {
  auto_select: {
    moment_id: 'moment-2024-07-02-001',
    platform: 'tiktok' as const,
    auto_select: true,
  },
  manual_select_gen_z: {
    moment_id: 'moment-2024-07-02-001',
    platform: 'tiktok' as const,
    auto_select: false,
    selected_persona: 'gen_z' as const,
  },
  manual_select_uncle: {
    moment_id: 'moment-2024-07-02-002',
    platform: 'instagram' as const,
    auto_select: false,
    selected_persona: 'kopitiam_uncle' as const,
  },
};

/**
 * Helper to create a custom persona script
 */
export function createPersonaScript(
  persona: 'gen_z' | 'kopitiam_uncle' | 'auntie' | 'attenborough',
  script: string,
  score?: number
): PersonaScript {
  const wordCount = script.split(/\s+/).length;
  const wordsPerMinute = 150;
  const estimatedDuration = (wordCount / wordsPerMinute) * 60;

  return {
    persona,
    script,
    word_count: wordCount,
    estimated_duration: parseFloat(estimatedDuration.toFixed(1)),
    persona_score: score ?? 7.0,
  };
}

/**
 * Helper to create audio response
 */
export function createAudioResponse(
  persona: string,
  momentId: string,
  duration: number
): AudioResponse {
  const voiceIds = {
    gen_z: 'voice_gen_z_energetic_123',
    kopitiam_uncle: 'voice_uncle_singlish_456',
    auntie: 'voice_auntie_warm_789',
    attenborough: 'voice_attenborough_narrator_012',
  };

  return {
    audio_url: `https://r2.cloudflare.com/capless/audio/${momentId}-${persona}.mp3`,
    duration,
    voice_id: voiceIds[persona as keyof typeof voiceIds] || 'voice_default',
    waveform_data: Array.from({ length: 100 }, (_, i) => Math.sin(i / 10) * 0.5),
  };
}

/**
 * Sample Voice DNA configurations (for testing validation)
 */
export const VOICE_DNA_CONFIGS = {
  gen_z: {
    persona: 'gen_z' as const,
    archetype: 'Digital Native',
    driving_force: 'Authenticity & Transparency',
    worldview: 'Social justice-oriented, questions authority, values diversity',
    voice_id: 'voice_gen_z_energetic_123',
    system_prompt: 'You are a Gen Z content creator who speaks authentically...',
    example_phrases: ['no cap', 'bruh', 'the shade is REAL'],
    validation_markers: ['slang usage', 'emoji presence', 'casual tone'],
  },
  kopitiam_uncle: {
    persona: 'kopitiam_uncle' as const,
    archetype: 'Heartland Storyteller',
    driving_force: 'Community & Pragmatism',
    worldview: 'Practical, street-smart, values common sense',
    voice_id: 'voice_uncle_singlish_456',
    system_prompt: 'You are a middle-aged Singaporean uncle who speaks in Singlish...',
    example_phrases: ['wah lau eh', 'like that how to trust', 'very clever lah'],
    validation_markers: ['singlish particles', 'kopitiam vocabulary', 'pragmatic tone'],
  },
};
