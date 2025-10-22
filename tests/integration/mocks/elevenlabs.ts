/**
 * Mock factory for ElevenLabs API responses
 * Matches ElevenLabs API response schemas
 */

import { z } from 'zod';

// ============================================================================
// ElevenLabs API Response Schemas
// ============================================================================

export const VoiceSettingsSchema = z.object({
  stability: z.number().min(0).max(1),
  similarity_boost: z.number().min(0).max(1),
  style: z.number().min(0).max(1).optional(),
  use_speaker_boost: z.boolean().optional(),
});

export const VoiceSchema = z.object({
  voice_id: z.string(),
  name: z.string(),
  category: z.string().optional(),
  description: z.string().optional(),
  labels: z.record(z.string()).optional(),
  settings: VoiceSettingsSchema.optional(),
});

export const TTSMetadataSchema = z.object({
  voice_id: z.string(),
  model_id: z.string(),
  request_id: z.string(),
  text_length: z.number(),
  audio_length_seconds: z.number().optional(),
});

export type Voice = z.infer<typeof VoiceSchema>;
export type TTSMetadata = z.infer<typeof TTSMetadataSchema>;

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Generate mock audio binary data (MP3 header + silence)
 * Returns a Buffer that can be used as audio response
 */
export function createMockAudioBuffer(durationSeconds: number = 10): ArrayBuffer {
  // Simplified MP3 header for testing
  const sampleRate = 44100;
  const samples = Math.floor(sampleRate * durationSeconds);
  const bytesPerSample = 2; // 16-bit audio
  const dataSize = samples * bytesPerSample;

  // Create a simple WAV file (easier than MP3 for mocking)
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // audio format (PCM)
  view.setUint16(22, 1, true); // number of channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Fill with silence (zeros)
  for (let i = 44; i < buffer.byteLength; i++) {
    view.setUint8(i, 0);
  }

  return buffer;
}

/**
 * Create a mock TTS response with audio data
 */
export function createTTSResponse(
  text: string,
  voiceId: string,
  modelId: string = 'eleven_turbo_v2_5'
): Response {
  // Estimate duration (rough: 150 words per minute)
  const wordCount = text.split(/\s+/).length;
  const durationSeconds = Math.ceil((wordCount / 150) * 60);

  const audioBuffer = createMockAudioBuffer(durationSeconds);

  return new Response(audioBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.byteLength.toString(),
      'X-Request-Id': `req-${Math.random().toString(36).substring(7)}`,
      'X-Voice-Id': voiceId,
      'X-Model-Id': modelId,
      'X-Text-Length': text.length.toString(),
      'X-Audio-Duration': durationSeconds.toString(),
    },
  });
}

/**
 * Create a mock voices list response
 */
export function createVoicesResponse(voices: Voice[]): Response {
  return new Response(
    JSON.stringify({ voices }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create a mock error response
 */
export function createElevenLabsErrorResponse(
  message: string,
  status: number = 500
): Response {
  return new Response(
    JSON.stringify({
      detail: {
        status: 'error',
        message,
      },
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

// ============================================================================
// Fixture Data
// ============================================================================

/**
 * Voice profiles matching the worker configuration
 */
export const VOICE_FIXTURES: Record<string, Voice> = {
  gen_z: {
    voice_id: 'voice_gen_z_energetic_123',
    name: 'Gen Z - Energetic Young Adult',
    category: 'generated',
    description: 'Energetic, casual, Gen Z voice with modern slang delivery',
    labels: {
      accent: 'american',
      age: 'young',
      gender: 'neutral',
      use_case: 'social_media',
    },
    settings: {
      stability: 0.5,
      similarity_boost: 0.8,
      style: 0.7,
      use_speaker_boost: true,
    },
  },
  kopitiam_uncle: {
    voice_id: 'voice_uncle_singlish_456',
    name: 'Kopitiam Uncle - Singapore Uncle',
    category: 'cloned',
    description: 'Middle-aged Singaporean uncle, conversational Singlish accent',
    labels: {
      accent: 'singaporean',
      age: 'middle_aged',
      gender: 'male',
      use_case: 'storytelling',
    },
    settings: {
      stability: 0.6,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true,
    },
  },
  auntie: {
    voice_id: 'voice_auntie_warm_789',
    name: 'Singaporean Auntie - Warm & Caring',
    category: 'cloned',
    description: 'Warm, caring Singaporean auntie voice with local accent',
    labels: {
      accent: 'singaporean',
      age: 'middle_aged',
      gender: 'female',
      use_case: 'narration',
    },
    settings: {
      stability: 0.65,
      similarity_boost: 0.7,
      style: 0.6,
      use_speaker_boost: true,
    },
  },
  attenborough: {
    voice_id: 'voice_attenborough_narrator_012',
    name: 'David Attenborough - Documentary Narrator',
    category: 'professional',
    description: 'British documentary narrator, calm and authoritative',
    labels: {
      accent: 'british',
      age: 'senior',
      gender: 'male',
      use_case: 'documentary',
    },
    settings: {
      stability: 0.75,
      similarity_boost: 0.85,
      style: 0.4,
      use_speaker_boost: false,
    },
  },
};

/**
 * Sample TTS requests for testing
 */
export const TTS_REQUEST_FIXTURES = {
  gen_z: {
    text: "Bruh, this Minister really said 'have his cake and eat it too' in Parliament. The shade is REAL.",
    voice_id: VOICE_FIXTURES.gen_z.voice_id,
    model_id: 'eleven_turbo_v2_5',
    voice_settings: VOICE_FIXTURES.gen_z.settings,
  },
  kopitiam_uncle: {
    text: "Wah lau eh, you see this Minister or not? Want to eat cake also want to keep cake.",
    voice_id: VOICE_FIXTURES.kopitiam_uncle.voice_id,
    model_id: 'eleven_turbo_v2_5',
    voice_settings: VOICE_FIXTURES.kopitiam_uncle.settings,
  },
  auntie: {
    text: "Aiyoh, this Minister ah, very greedy leh. Want everything also must have.",
    voice_id: VOICE_FIXTURES.auntie.voice_id,
    model_id: 'eleven_turbo_v2_5',
    voice_settings: VOICE_FIXTURES.auntie.settings,
  },
  attenborough: {
    text: "Here, in the halls of Parliament, we observe a fascinating display of political theater.",
    voice_id: VOICE_FIXTURES.attenborough.voice_id,
    model_id: 'eleven_multilingual_v2',
    voice_settings: VOICE_FIXTURES.attenborough.settings,
  },
};

/**
 * Helper to calculate estimated audio duration
 */
export function estimateAudioDuration(text: string, wordsPerMinute: number = 150): number {
  const wordCount = text.split(/\s+/).length;
  return Math.ceil((wordCount / wordsPerMinute) * 60);
}
