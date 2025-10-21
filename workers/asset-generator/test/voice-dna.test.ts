import { describe, it, expect } from 'vitest';
import { VOICE_DNA_CONFIGS, getVoiceDNA, validateVoiceDNA } from '../src/personas/voice-dna';
import { Persona } from '../src/types';

describe('Voice DNA System', () => {
  describe('VOICE_DNA_CONFIGS', () => {
    it('should have configurations for all 4 personas', () => {
      expect(Object.keys(VOICE_DNA_CONFIGS)).toHaveLength(4);
      expect(VOICE_DNA_CONFIGS.gen_z).toBeDefined();
      expect(VOICE_DNA_CONFIGS.kopitiam_uncle).toBeDefined();
      expect(VOICE_DNA_CONFIGS.auntie).toBeDefined();
      expect(VOICE_DNA_CONFIGS.attenborough).toBeDefined();
    });

    it('should have complete Voice DNA structure for each persona', () => {
      Object.values(VOICE_DNA_CONFIGS).forEach(config => {
        expect(config.persona).toBeTruthy();
        expect(config.archetype).toBeTruthy();
        expect(config.driving_force).toBeTruthy();
        expect(config.worldview).toBeTruthy();
        expect(config.system_prompt).toBeTruthy();
        expect(config.example_phrases).toBeInstanceOf(Array);
        expect(config.validation_markers).toBeInstanceOf(Array);
      });
    });

    it('should have at least 5 validation markers per persona', () => {
      Object.values(VOICE_DNA_CONFIGS).forEach(config => {
        expect(config.validation_markers.length).toBeGreaterThanOrEqual(5);
      });
    });

    it('should have system prompts > 500 characters', () => {
      Object.values(VOICE_DNA_CONFIGS).forEach(config => {
        expect(config.system_prompt.length).toBeGreaterThan(500);
      });
    });
  });

  describe('getVoiceDNA', () => {
    const mockEnv = {
      ELEVENLABS_VOICE_GEN_Z: 'voice_gen_z_test',
      ELEVENLABS_VOICE_UNCLE: 'voice_uncle_test',
      ELEVENLABS_VOICE_AUNTIE: 'voice_auntie_test',
      ELEVENLABS_VOICE_ATTENBOROUGH: 'voice_attenborough_test',
    };

    it('should populate voice_id from environment for Gen Z', () => {
      const voiceDNA = getVoiceDNA('gen_z', mockEnv);
      expect(voiceDNA.voice_id).toBe('voice_gen_z_test');
    });

    it('should populate voice_id for Kopitiam Uncle', () => {
      const voiceDNA = getVoiceDNA('kopitiam_uncle', mockEnv);
      expect(voiceDNA.voice_id).toBe('voice_uncle_test');
    });

    it('should populate voice_id for Anxious Auntie', () => {
      const voiceDNA = getVoiceDNA('auntie', mockEnv);
      expect(voiceDNA.voice_id).toBe('voice_auntie_test');
    });

    it('should populate voice_id for Attenborough', () => {
      const voiceDNA = getVoiceDNA('attenborough', mockEnv);
      expect(voiceDNA.voice_id).toBe('voice_attenborough_test');
    });

    it('should preserve all other Voice DNA properties', () => {
      const voiceDNA = getVoiceDNA('gen_z', mockEnv);
      expect(voiceDNA.archetype).toBe(VOICE_DNA_CONFIGS.gen_z.archetype);
      expect(voiceDNA.driving_force).toBe(VOICE_DNA_CONFIGS.gen_z.driving_force);
      expect(voiceDNA.worldview).toBe(VOICE_DNA_CONFIGS.gen_z.worldview);
    });
  });

  describe('validateVoiceDNA', () => {
    it('should validate Gen Z script with markers', () => {
      const script = "Okay bestie, it's giving absolute chaos. I can't even. Tell me this makes sense? 💀";
      const result = validateVoiceDNA(script, 'gen_z');

      expect(result.valid).toBe(true);
      expect(result.markers_found.length).toBeGreaterThanOrEqual(2);
      expect(result.markers_found).toContain('bestie');
      expect(result.markers_found).toContain("it's giving");
      expect(result.markers_found).toContain("i can't");
    });

    it('should validate Kopitiam Uncle script with 3+ markers', () => {
      const script = 'Wah lau eh! Liddat also can ah? Aiyah, last time not like that leh. How to tahan lor!';
      const result = validateVoiceDNA(script, 'kopitiam_uncle');

      expect(result.valid).toBe(true);
      expect(result.markers_found.length).toBeGreaterThanOrEqual(3);
      // Check that it contains some of the expected markers
      expect(result.markers_found).toContain('wah lau');
      expect(result.markers_found).toContain('leh');
      expect(result.markers_found).toContain('aiyah');
    });

    it('should validate Anxious Auntie script with markers', () => {
      const script = 'Aiyoh! How? My family so stress lah. Cannot like that, must plan ahead!';
      const result = validateVoiceDNA(script, 'auntie');

      expect(result.valid).toBe(true);
      expect(result.markers_found.length).toBeGreaterThanOrEqual(2);
      expect(result.markers_found).toContain('aiyoh');
      expect(result.markers_found).toContain('my family');
      expect(result.markers_found).toContain('so stress');
    });

    it('should validate Attenborough script with markers', () => {
      const script = 'Here in the parliamentary chamber, we observe a remarkable behavior. In nature, such patterns are curious indeed.';
      const result = validateVoiceDNA(script, 'attenborough');

      expect(result.valid).toBe(true);
      expect(result.markers_found.length).toBeGreaterThanOrEqual(2);
      expect(result.markers_found).toContain('here');
      expect(result.markers_found).toContain('observe');
      expect(result.markers_found).toContain('remarkable');
    });

    it('should reject Gen Z script with insufficient markers', () => {
      const script = 'This is a normal statement about politics without any slang.';
      const result = validateVoiceDNA(script, 'gen_z');

      expect(result.valid).toBe(false);
      expect(result.markers_found.length).toBeLessThan(2);
    });

    it('should reject Kopitiam Uncle script with < 3 markers', () => {
      const script = 'This sentence has lah but nothing else really.';
      const result = validateVoiceDNA(script, 'kopitiam_uncle');

      expect(result.valid).toBe(false);
      expect(result.markers_found.length).toBeLessThan(3);
    });

    it('should be case-insensitive', () => {
      const script = "BESTIE, IT'S GIVING chaos. I CAN'T even.";
      const result = validateVoiceDNA(script, 'gen_z');

      expect(result.valid).toBe(true);
      expect(result.markers_found.length).toBeGreaterThanOrEqual(2);
    });

    it('should return score between 0-10', () => {
      const script = "Bestie, it's giving drama. Tell me this isn't wild!";
      const result = validateVoiceDNA(script, 'gen_z');

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(10);
    });

    it('should return higher scores for more markers', () => {
      const scriptFew = "Bestie, this is wild.";
      const scriptMany = "Okay bestie, it's giving chaos. I can't even. Tell me this makes sense? The way they said that literally broke me.";

      const resultFew = validateVoiceDNA(scriptFew, 'gen_z');
      const resultMany = validateVoiceDNA(scriptMany, 'gen_z');

      expect(resultMany.score).toBeGreaterThan(resultFew.score);
    });
  });
});
