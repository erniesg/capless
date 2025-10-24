import { describe, it, expect } from 'vitest';
import {
  buildSoraPrompt,
  buildSimplePrompt,
  buildPersonaSelectionPrompt,
  validateScriptMatchesPersona,
  extractPromptMetadata,
} from './prompts';
import { Moment, Persona } from './types';

describe('Prompts', () => {
  const mockMoment: Moment = {
    moment_id: 'test-moment-1',
    quote: 'We need better climate policies',
    speaker: 'Grace Fu',
    timestamp_start: '00:10:00',
    timestamp_end: '00:10:15',
    virality_score: 9,
    why_viral: 'Strong environmental stance',
    topic: 'Climate Change',
    emotional_tone: 'Urgent, Determined',
    target_demographic: 'Young environmentalists',
    transcript_id: 'test-transcript',
  };

  const mockScript = `
    The way they're talking about climate change like it's some future problem?
    Hello! It's happening NOW! The planet is literally on fire and they're still
    debating whether we should do something about it. It's giving denial energy.
  `;

  describe('buildSoraPrompt', () => {
    it('should build comprehensive prompt for gen_z', () => {
      const prompt = buildSoraPrompt(mockMoment, mockScript, 'gen_z');

      // Check all required sections are present
      expect(prompt).toContain('TIKTOK REACTION VIDEO');
      expect(prompt).toContain('MOMENT CONTEXT');
      expect(prompt).toContain('PERSONA DELIVERING THE REACTION');
      expect(prompt).toContain('SCRIPT TO VISUALIZE');
      expect(prompt).toContain('VISUAL STYLE (GEN Z)');
      expect(prompt).toContain('TECHNICAL REQUIREMENTS');

      // Check moment details
      expect(prompt).toContain(mockMoment.speaker);
      expect(prompt).toContain(mockMoment.quote);
      expect(prompt).toContain(mockMoment.topic);
      expect(prompt).toContain(mockMoment.why_viral);

      // Check script
      expect(prompt).toContain(mockScript);

      // Check persona details
      expect(prompt).toContain('GEN Z');
      expect(prompt).toContain('Truth-Telling Jester');

      // Check technical specs
      expect(prompt).toContain('1080x1920');
      expect(prompt).toContain('10-15 seconds');
      expect(prompt).toContain('9:16');
    });

    it('should build different visual styles for different personas', () => {
      const personas: Persona[] = ['gen_z', 'kopitiam_uncle', 'auntie', 'attenborough'];

      const prompts = personas.map((persona) =>
        buildSoraPrompt(mockMoment, mockScript, persona)
      );

      // Each should have unique visual style section
      expect(prompts[0]).toContain('VISUAL STYLE (GEN Z)');
      expect(prompts[0]).toContain('Modern, trendy, TikTok-native');

      expect(prompts[1]).toContain('VISUAL STYLE (KOPITIAM UNCLE)');
      expect(prompts[1]).toContain('Coffee shop, HDB void deck');

      expect(prompts[2]).toContain('VISUAL STYLE (AUNTIE)');
      expect(prompts[2]).toContain('Home kitchen, market');

      expect(prompts[3]).toContain('VISUAL STYLE (ATTENBOROUGH)');
      expect(prompts[3]).toContain('Nature documentary, observational');
    });

    it('should include all moment metadata in context', () => {
      const prompt = buildSoraPrompt(mockMoment, mockScript, 'gen_z');

      expect(prompt).toContain(`Speaker: ${mockMoment.speaker}`);
      expect(prompt).toContain(`Quote: "${mockMoment.quote}"`);
      expect(prompt).toContain(`Topic: ${mockMoment.topic}`);
      expect(prompt).toContain(`Emotional Tone: ${mockMoment.emotional_tone}`);
      expect(prompt).toContain(`Why It's Viral: ${mockMoment.why_viral}`);
      expect(prompt).toContain(`Target Audience: ${mockMoment.target_demographic}`);
    });

    it('should include persona characteristics', () => {
      const prompt = buildSoraPrompt(mockMoment, mockScript, 'kopitiam_uncle');

      expect(prompt).toContain('Archetype: The Seasoned Observer');
      expect(prompt).toContain('Driving Force: Distilling decades of life into practical wisdom');
      expect(prompt).toContain('Worldview: Everything old is new again');
    });
  });

  describe('buildSimplePrompt', () => {
    it('should create simple prompt for quick testing', () => {
      const prompt = buildSimplePrompt('Test quote here', 'gen_z', 15);

      expect(prompt).toContain('15-second');
      expect(prompt).toContain('vertical TikTok video');
      expect(prompt).toContain('1080x1920');
      expect(prompt).toContain('Test quote here');
      expect(prompt).toContain('Gen Z TikToker');
    });

    it('should handle different personas', () => {
      const genZPrompt = buildSimplePrompt('Quote', 'gen_z');
      const unclePrompt = buildSimplePrompt('Quote', 'kopitiam_uncle');
      const auntiePrompt = buildSimplePrompt('Quote', 'auntie');
      const attenboroughPrompt = buildSimplePrompt('Quote', 'attenborough');

      expect(genZPrompt).toContain('Gen Z TikToker');
      expect(unclePrompt).toContain('Singaporean uncle in a kopitiam');
      expect(auntiePrompt).toContain('Singaporean auntie');
      expect(attenboroughPrompt).toContain('David Attenborough');
    });

    it('should use default duration', () => {
      const prompt = buildSimplePrompt('Quote', 'gen_z');
      expect(prompt).toContain('15-second');
    });

    it('should handle custom duration', () => {
      const prompt = buildSimplePrompt('Quote', 'gen_z', 20);
      expect(prompt).toContain('20-second');
    });
  });

  describe('buildPersonaSelectionPrompt', () => {
    it('should create persona selection prompt', () => {
      const prompt = buildPersonaSelectionPrompt(mockMoment);

      // Check moment details
      expect(prompt).toContain(mockMoment.speaker);
      expect(prompt).toContain(mockMoment.quote);
      expect(prompt).toContain(mockMoment.topic);
      expect(prompt).toContain(mockMoment.emotional_tone);

      // Check persona options
      expect(prompt).toContain('gen_z');
      expect(prompt).toContain('kopitiam_uncle');
      expect(prompt).toContain('auntie');
      expect(prompt).toContain('attenborough');

      // Check selection criteria
      expect(prompt).toContain('SELECTION CRITERIA');
      expect(prompt).toContain('worldview');
      expect(prompt).toContain('emotional connection');
      expect(prompt).toContain('shareability');

      // Check expected JSON format
      expect(prompt).toContain('chosen_persona');
      expect(prompt).toContain('reasoning');
      expect(prompt).toContain('viral_potential');
      expect(prompt).toContain('emotional_hook');
    });
  });

  describe('validateScriptMatchesPersona', () => {
    it('should validate gen_z script with markers', () => {
      const genZScript = "It's giving corruption energy. The way that they're deflecting accountability...";
      const score = validateScriptMatchesPersona(genZScript, 'gen_z');

      // Should have good validation score (has "giving" and "the way")
      expect(score).toBeGreaterThan(0.5);
    });

    it('should validate kopitiam_uncle script with markers', () => {
      const uncleScript = "Wah, I tell you ah, this kind of thing I seen before lah. Last time also like that leh.";
      const score = validateScriptMatchesPersona(uncleScript, 'kopitiam_uncle');

      // Should have good validation score (has "wah", "lah", "leh")
      expect(score).toBeGreaterThan(0.5);
    });

    it('should validate auntie script with markers', () => {
      const auntieScript = "Aiyah! Cannot like that! Later how? This one very dangerous leh, must be careful!";
      const score = validateScriptMatchesPersona(auntieScript, 'auntie');

      // Should have good validation score (has "aiyah", "cannot", "must", "later how")
      expect(score).toBeGreaterThan(0.7);
    });

    it('should validate attenborough script with markers', () => {
      const attenboroughScript = "Here, in the halls of power, observe as the dominant male displays territorial behavior...";
      const score = validateScriptMatchesPersona(attenboroughScript, 'attenborough');

      // Should have good validation score (has "here", "observe", "behavior")
      expect(score).toBeGreaterThan(0.5);
    });

    it('should return 1.0 for persona with no validation markers', () => {
      const score = validateScriptMatchesPersona("Any script", 'ai_decide');
      expect(score).toBe(1.0);
    });

    it('should return 0 for completely mismatched script', () => {
      const corporateScript = "In accordance with our strategic initiatives, we shall leverage synergies.";
      const score = validateScriptMatchesPersona(corporateScript, 'gen_z');

      // Should have low validation score (no gen_z markers)
      expect(score).toBe(0);
    });

    it('should be case-insensitive', () => {
      const script = "IT'S GIVING CORRUPTION ENERGY. THE WAY THAT...";
      const score = validateScriptMatchesPersona(script, 'gen_z');

      expect(score).toBeGreaterThan(0.5);
    });
  });

  describe('extractPromptMetadata', () => {
    it('should extract metadata from complete prompt', () => {
      const prompt = buildSoraPrompt(mockMoment, mockScript, 'gen_z');
      const metadata = extractPromptMetadata(prompt);

      expect(metadata).toHaveProperty('persona');
      expect(metadata).toHaveProperty('topic');
      expect(metadata).toHaveProperty('speaker');
      expect(metadata).toHaveProperty('duration');
      expect(metadata).toHaveProperty('format');
      expect(metadata).toHaveProperty('estimated_word_count');

      expect(metadata.persona).toContain('GEN Z');
      expect(metadata.topic).toBe(mockMoment.topic);
      expect(metadata.speaker).toBe(mockMoment.speaker);
      expect(metadata.format).toContain('1080x1920');
      expect(metadata.estimated_word_count).toBeGreaterThan(0);
    });

    it('should handle prompts without all metadata', () => {
      const simplePrompt = "Create a video about politics";
      const metadata = extractPromptMetadata(simplePrompt);

      // Should have defaults for missing fields
      expect(metadata.persona).toBe('unknown');
      expect(metadata.topic).toBe('unknown');
      expect(metadata.speaker).toBe('unknown');
      expect(metadata.duration).toBe(15);
      expect(metadata.format).toBe('1080x1920');
    });

    it('should count words approximately', () => {
      const shortPrompt = "Short prompt";
      const longPrompt = buildSoraPrompt(mockMoment, mockScript, 'gen_z');

      const shortMeta = extractPromptMetadata(shortPrompt);
      const longMeta = extractPromptMetadata(longPrompt);

      expect(shortMeta.estimated_word_count).toBeLessThan(10);
      expect(longMeta.estimated_word_count).toBeGreaterThan(100);
    });
  });

  describe('Prompt Quality', () => {
    it('should generate prompts under reasonable length', () => {
      const prompt = buildSoraPrompt(mockMoment, mockScript, 'gen_z');

      // Sora API likely has prompt length limits
      // Ensure our prompts are reasonable (< 5000 words)
      const wordCount = prompt.split(/\s+/).length;
      expect(wordCount).toBeLessThan(5000);
    });

    it('should not have duplicate sections', () => {
      const prompt = buildSoraPrompt(mockMoment, mockScript, 'gen_z');

      // Count occurrences of section headers
      const contextCount = (prompt.match(/MOMENT CONTEXT/g) || []).length;
      const personaCount = (prompt.match(/PERSONA DELIVERING THE REACTION/g) || []).length;
      const scriptCount = (prompt.match(/SCRIPT TO VISUALIZE/g) || []).length;

      expect(contextCount).toBe(1);
      expect(personaCount).toBe(1);
      expect(scriptCount).toBe(1);
    });

    it('should maintain consistent formatting', () => {
      const personas: Persona[] = ['gen_z', 'kopitiam_uncle', 'auntie', 'attenborough'];

      personas.forEach((persona) => {
        const prompt = buildSoraPrompt(mockMoment, mockScript, persona);

        // All prompts should have consistent structure
        expect(prompt).toContain('MOMENT CONTEXT:');
        expect(prompt).toContain('PERSONA DELIVERING THE REACTION:');
        expect(prompt).toContain('SCRIPT TO VISUALIZE:');
        expect(prompt).toContain('TECHNICAL REQUIREMENTS:');

        // Should end with consistent message
        expect(prompt).toContain('viral-worthy video');
      });
    });
  });
});
