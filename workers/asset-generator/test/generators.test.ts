import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioGenerator } from '../src/generators/audio-generator';
import { ThumbnailGenerator } from '../src/generators/thumbnail-generator';
import { Moment } from '../src/types';

// Mock environment
const mockEnv: any = {
  OPENAI_API_KEY: 'test-key',
  ELEVENLABS_API_KEY: 'test-eleven-key',
  ELEVENLABS_MODEL: 'eleven_turbo_v2_5',
  ELEVENLABS_VOICE_GEN_Z: 'voice_gen_z_id',
  ELEVENLABS_VOICE_UNCLE: 'voice_uncle_id',
  ELEVENLABS_VOICE_AUNTIE: 'voice_auntie_id',
  ELEVENLABS_VOICE_ATTENBOROUGH: 'voice_attenborough_id',
  ENVIRONMENT: 'test',
  R2: {
    put: vi.fn(),
  },
};

const mockMoment: Moment = {
  moment_id: 'test_moment_123',
  quote: 'Test quote from parliament',
  speaker: 'Test Speaker',
  topic: 'Test Topic',
  context: 'Test context',
};

describe('AudioGenerator', () => {
  let generator: AudioGenerator;

  beforeEach(() => {
    generator = new AudioGenerator(mockEnv);
    vi.clearAllMocks();
  });

  describe('cleanScriptForTTS', () => {
    it('should remove emojis from script', () => {
      const script = 'This has emojis 💀 and 🤯 in it ✨';
      // @ts-ignore - accessing private method for testing
      const cleaned = generator.cleanScriptForTTS(script);

      expect(cleaned).not.toContain('💀');
      expect(cleaned).not.toContain('🤯');
      expect(cleaned).not.toContain('✨');
      expect(cleaned).toContain('This has emojis');
    });

    it('should remove markdown formatting', () => {
      const script = 'This has **bold** and *italic* text';
      // @ts-ignore
      const cleaned = generator.cleanScriptForTTS(script);

      expect(cleaned).not.toContain('**');
      expect(cleaned).not.toContain('*');
      expect(cleaned).toBe('This has bold and italic text');
    });

    it('should remove underscores', () => {
      const script = 'This_has_underscores';
      // @ts-ignore
      const cleaned = generator.cleanScriptForTTS(script);

      expect(cleaned).not.toContain('_');
      expect(cleaned).toBe('Thishasunderscores');
    });

    it('should clean up extra whitespace', () => {
      const script = 'This  has   extra    spaces';
      // @ts-ignore
      const cleaned = generator.cleanScriptForTTS(script);

      expect(cleaned).toBe('This has extra spaces');
    });

    it('should trim leading/trailing whitespace', () => {
      const script = '   Leading and trailing   ';
      // @ts-ignore
      const cleaned = generator.cleanScriptForTTS(script);

      expect(cleaned).toBe('Leading and trailing');
    });
  });

  describe('getStabilityForPersona', () => {
    it('should return 0.4 for Gen Z (expressive)', () => {
      // @ts-ignore
      const stability = generator.getStabilityForPersona('gen_z');
      expect(stability).toBe(0.4);
    });

    it('should return 0.7 for Attenborough (stable)', () => {
      // @ts-ignore
      const stability = generator.getStabilityForPersona('attenborough');
      expect(stability).toBe(0.7);
    });

    it('should return 0.3 for Auntie (very expressive)', () => {
      // @ts-ignore
      const stability = generator.getStabilityForPersona('auntie');
      expect(stability).toBe(0.3);
    });

    it('should return 0.5 for Kopitiam Uncle (balanced)', () => {
      // @ts-ignore
      const stability = generator.getStabilityForPersona('kopitiam_uncle');
      expect(stability).toBe(0.5);
    });
  });

  describe('getStyleForPersona', () => {
    it('should return 0.8 for Gen Z (high emotion)', () => {
      // @ts-ignore
      const style = generator.getStyleForPersona('gen_z');
      expect(style).toBe(0.8);
    });

    it('should return 0.4 for Attenborough (restrained)', () => {
      // @ts-ignore
      const style = generator.getStyleForPersona('attenborough');
      expect(style).toBe(0.4);
    });

    it('should return 0.9 for Auntie (maximum emotion)', () => {
      // @ts-ignore
      const style = generator.getStyleForPersona('auntie');
      expect(style).toBe(0.9);
    });
  });

  describe('estimateDuration', () => {
    it('should estimate duration based on word count and persona', () => {
      // Gen Z: 3.5 words/sec, so 70 words ≈ 20 seconds
      // @ts-ignore
      const duration = generator.estimateDuration(70, 'gen_z');

      expect(duration).toBeGreaterThanOrEqual(15);
      expect(duration).toBeLessThanOrEqual(25);
    });

    it('should give longer duration for Attenborough (slower pace)', () => {
      // Attenborough: 2.5 words/sec, so 70 words ≈ 28 seconds
      // @ts-ignore
      const duration = generator.estimateDuration(70, 'attenborough');

      expect(duration).toBeGreaterThanOrEqual(25);
      expect(duration).toBeLessThanOrEqual(32);
    });

    it('should give shorter duration for Gen Z (faster pace)', () => {
      // @ts-ignore
      const genZDuration = generator.estimateDuration(100, 'gen_z');
      // @ts-ignore
      const attenboroughDuration = generator.estimateDuration(100, 'attenborough');

      expect(genZDuration).toBeLessThan(attenboroughDuration);
    });
  });

  describe('checkAvailability', () => {
    it('should return true if ElevenLabs API is available', async () => {
      global.fetch = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));

      const available = await generator.checkAvailability();

      expect(available).toBe(true);
    });

    it('should return false if ElevenLabs API is unavailable', async () => {
      global.fetch = vi.fn().mockResolvedValue(new Response('Error', { status: 500 }));

      const available = await generator.checkAvailability();

      expect(available).toBe(false);
    });

    it('should return false on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const available = await generator.checkAvailability();

      expect(available).toBe(false);
    });
  });
});

describe('ThumbnailGenerator', () => {
  let generator: ThumbnailGenerator;

  beforeEach(() => {
    generator = new ThumbnailGenerator(mockEnv);
    vi.clearAllMocks();
  });

  describe('getPersonaLabel', () => {
    it('should return correct label for Gen Z', () => {
      // @ts-ignore
      const label = generator.getPersonaLabel('gen_z');
      expect(label).toBe('STRAIGHTOK AI');
    });

    it('should return correct label for Kopitiam Uncle', () => {
      // @ts-ignore
      const label = generator.getPersonaLabel('kopitiam_uncle');
      expect(label).toBe('KOPITIAM UNCLE');
    });

    it('should return correct label for Anxious Auntie', () => {
      // @ts-ignore
      const label = generator.getPersonaLabel('auntie');
      expect(label).toBe('ANXIOUS AUNTIE');
    });

    it('should return correct label for Attenborough', () => {
      // @ts-ignore
      const label = generator.getPersonaLabel('attenborough');
      expect(label).toBe('THE OBSERVER');
    });
  });

  describe('createImagePrompt', () => {
    it('should include persona branding for Gen Z', () => {
      // @ts-ignore
      const prompt = generator.createImagePrompt(mockMoment, 'gen_z');

      expect(prompt).toContain('vibrant neon colors');
      expect(prompt).toContain('TikTok aesthetic');
      expect(prompt).toContain(mockMoment.quote.substring(0, 100));
    });

    it('should include persona branding for Kopitiam Uncle', () => {
      // @ts-ignore
      const prompt = generator.createImagePrompt(mockMoment, 'kopitiam_uncle');

      expect(prompt).toContain('kopitiam coffee shop vibes');
      expect(prompt).toContain('retro Singapore aesthetic');
    });

    it('should include persona branding for Anxious Auntie', () => {
      // @ts-ignore
      const prompt = generator.createImagePrompt(mockMoment, 'auntie');

      expect(prompt).toContain('warm pastel colors');
      expect(prompt).toContain('family-oriented design');
    });

    it('should include persona branding for Attenborough', () => {
      // @ts-ignore
      const prompt = generator.createImagePrompt(mockMoment, 'attenborough');

      expect(prompt).toContain('documentary style');
      expect(prompt).toContain('BBC quality');
    });

    it('should include speaker and quote', () => {
      // @ts-ignore
      const prompt = generator.createImagePrompt(mockMoment, 'gen_z');

      expect(prompt).toContain(mockMoment.speaker);
      expect(prompt).toContain(mockMoment.quote.substring(0, 100));
    });
  });

  describe('createSVGThumbnail', () => {
    it('should create SVG with correct dimensions (9:16)', () => {
      // @ts-ignore
      const svg = generator.createSVGThumbnail(mockMoment, 'gen_z', 1080, 1920);

      expect(svg).toContain('width="1080"');
      expect(svg).toContain('height="1920"');
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });

    it('should include persona label', () => {
      // @ts-ignore
      const svg = generator.createSVGThumbnail(mockMoment, 'gen_z', 1080, 1920);

      expect(svg).toContain('STRAIGHTOK AI');
    });

    it('should include quote text', () => {
      // @ts-ignore
      const svg = generator.createSVGThumbnail(mockMoment, 'gen_z', 1080, 1920);

      expect(svg).toContain(mockMoment.quote);
    });

    it('should include speaker name', () => {
      // @ts-ignore
      const svg = generator.createSVGThumbnail(mockMoment, 'gen_z', 1080, 1920);

      expect(svg).toContain(mockMoment.speaker);
    });

    it('should include topic', () => {
      // @ts-ignore
      const svg = generator.createSVGThumbnail(mockMoment, 'gen_z', 1080, 1920);

      expect(svg).toContain(mockMoment.topic);
    });

    it('should include #Capless branding', () => {
      // @ts-ignore
      const svg = generator.createSVGThumbnail(mockMoment, 'gen_z', 1080, 1920);

      expect(svg).toContain('#Capless');
    });

    it('should truncate long quotes', () => {
      const longMoment = {
        ...mockMoment,
        quote: 'This is a very long quote that goes on and on '.repeat(10),
      };

      // @ts-ignore
      const svg = generator.createSVGThumbnail(longMoment, 'gen_z', 1080, 1920);

      // Should contain truncation indicator
      expect(svg).toContain('...');
    });

    it('should use different colors for different personas', () => {
      // @ts-ignore
      const genZSvg = generator.createSVGThumbnail(mockMoment, 'gen_z', 1080, 1920);
      // @ts-ignore
      const uncleSvg = generator.createSVGThumbnail(mockMoment, 'kopitiam_uncle', 1080, 1920);

      // Gen Z uses black background
      expect(genZSvg).toContain('fill="#000000"');

      // Uncle uses brown background
      expect(uncleSvg).toContain('fill="#3E2723"');
    });
  });
});
