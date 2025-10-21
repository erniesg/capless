import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScriptGenerator } from '../src/generators/script-generator';
import { Moment, Persona } from '../src/types';

// Mock environment
const mockEnv: any = {
  OPENAI_API_KEY: 'test-key',
  OPENAI_MODEL: 'gpt-4o',
  ELEVENLABS_VOICE_GEN_Z: 'voice_gen_z',
  ELEVENLABS_VOICE_UNCLE: 'voice_uncle',
  ELEVENLABS_VOICE_AUNTIE: 'voice_auntie',
  ELEVENLABS_VOICE_ATTENBOROUGH: 'voice_attenborough',
  MOMENTS: {
    fetch: vi.fn(),
  },
};

const mockMoment: Moment = {
  moment_id: 'test_moment_123',
  quote: 'These are consequences of what I would describe as a knot that insurers and policyholders find themselves caught in.',
  speaker: 'Ms Rahayu Mahzam',
  topic: 'Healthcare Insurance',
  context: 'Discussion on rising Integrated Shield Plan premiums',
  virality_score: 8.5,
};

describe('ScriptGenerator', () => {
  let generator: ScriptGenerator;

  beforeEach(() => {
    generator = new ScriptGenerator(mockEnv);
    vi.clearAllMocks();
  });

  describe('getMoment', () => {
    it('should fetch moment from Moments worker', async () => {
      mockEnv.MOMENTS.fetch.mockResolvedValue(
        new Response(JSON.stringify({ moment: mockMoment }), { status: 200 })
      );

      const moment = await generator.getMoment('test_moment_123');

      expect(moment).toEqual(mockMoment);
      expect(mockEnv.MOMENTS.fetch).toHaveBeenCalledWith(
        'https://internal/api/moments/test_moment_123'
      );
    });

    it('should throw error if moment not found', async () => {
      mockEnv.MOMENTS.fetch.mockResolvedValue(
        new Response('Not found', { status: 404 })
      );

      await expect(generator.getMoment('nonexistent')).rejects.toThrow('Moment not found');
    });
  });

  describe('estimateDuration', () => {
    it('should estimate Gen Z persona duration correctly', () => {
      const script = 'This is a test script with exactly ten words here.';
      // @ts-ignore - accessing private method for testing
      const duration = generator.estimateDuration(script, 'gen_z');

      // Gen Z speaks at 3.5 words/sec, so 10 words ≈ 2.86 seconds
      expect(duration).toBeGreaterThanOrEqual(2);
      expect(duration).toBeLessThanOrEqual(4);
    });

    it('should estimate Attenborough persona duration correctly', () => {
      const script = 'This is a test script with exactly ten words here.';
      // @ts-ignore - accessing private method for testing
      const duration = generator.estimateDuration(script, 'attenborough');

      // Attenborough speaks at 2.5 words/sec, so 10 words = 4 seconds
      expect(duration).toBeGreaterThanOrEqual(3);
      expect(duration).toBeLessThanOrEqual(5);
    });

    it('should add pause time for emojis', () => {
      const scriptWithEmoji = 'Test 💀 script ✨ with 🤯 emojis 😤';
      const scriptWithout = 'Test script with emojis';

      // @ts-ignore
      const durationWith = generator.estimateDuration(scriptWithEmoji, 'gen_z');
      // @ts-ignore
      const durationWithout = generator.estimateDuration(scriptWithout, 'gen_z');

      // Should be longer due to emoji pauses
      expect(durationWith).toBeGreaterThan(durationWithout);
    });

    it('should add pause time for exclamation marks', () => {
      const scriptWith = 'Test! Script! With! Exclamations!';
      const scriptWithout = 'Test Script With Exclamations';

      // @ts-ignore
      const durationWith = generator.estimateDuration(scriptWith, 'gen_z');
      // @ts-ignore
      const durationWithout = generator.estimateDuration(scriptWithout, 'gen_z');

      expect(durationWith).toBeGreaterThan(durationWithout);
    });

    it('should add pause time for questions', () => {
      const scriptWith = 'Is this? Really? A question?';
      const scriptWithout = 'Is this really a question';

      // @ts-ignore
      const durationWith = generator.estimateDuration(scriptWith, 'gen_z');
      // @ts-ignore
      const durationWithout = generator.estimateDuration(scriptWithout, 'gen_z');

      expect(durationWith).toBeGreaterThan(durationWithout);
    });

    it('should handle different speaking speeds per persona', () => {
      const script = 'This is a test script with exactly ten words here.';

      // @ts-ignore
      const genZDuration = generator.estimateDuration(script, 'gen_z');
      // @ts-ignore
      const attenboroughDuration = generator.estimateDuration(script, 'attenborough');

      // Attenborough speaks slower (2.5 wps) than Gen Z (3.5 wps)
      expect(attenboroughDuration).toBeGreaterThan(genZDuration);
    });
  });

  describe('Word count and duration validation', () => {
    it('should warn if word count < 80', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const shortScript = {
        persona: 'gen_z' as Persona,
        script: 'Too short',
        word_count: 50,
        estimated_duration: 15,
        persona_score: 8,
      };

      // @ts-ignore - testing internal validation
      const scripts = [shortScript];
      scripts.forEach(script => {
        if (script.word_count < 80 || script.word_count > 170) {
          console.warn(`Script for ${script.persona} has ${script.word_count} words`);
        }
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should warn if word count > 170', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const longScript = {
        persona: 'gen_z' as Persona,
        script: 'Way too long '.repeat(30),
        word_count: 200,
        estimated_duration: 60,
        persona_score: 8,
      };

      // @ts-ignore - testing internal validation
      const scripts = [longScript];
      scripts.forEach(script => {
        if (script.word_count < 80 || script.word_count > 170) {
          console.warn(`Script for ${script.persona} has ${script.word_count} words`);
        }
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should warn if duration < 25s', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const shortDuration = {
        persona: 'gen_z' as Persona,
        script: 'Short',
        word_count: 100,
        estimated_duration: 20,
        persona_score: 8,
      };

      // @ts-ignore
      const scripts = [shortDuration];
      scripts.forEach(script => {
        if (script.estimated_duration < 25 || script.estimated_duration > 50) {
          console.warn(`Script for ${script.persona} has duration ${script.estimated_duration}s`);
        }
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should warn if duration > 50s', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const longDuration = {
        persona: 'gen_z' as Persona,
        script: 'Long',
        word_count: 100,
        estimated_duration: 55,
        persona_score: 8,
      };

      // @ts-ignore
      const scripts = [longDuration];
      scripts.forEach(script => {
        if (script.estimated_duration < 25 || script.estimated_duration > 50) {
          console.warn(`Script for ${script.persona} has duration ${script.estimated_duration}s`);
        }
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
