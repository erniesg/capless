import OpenAI from 'openai';
import { Env, Moment, Persona, PersonaScript, Platform } from '../types';
import { getVoiceDNA, validateVoiceDNA } from '../personas/voice-dna';

export class ScriptGenerator {
  private openai: OpenAI;
  private env: Env;

  constructor(env: Env) {
    this.env = env;
    this.openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  /**
   * Fetch moment data from Moments worker
   */
  async getMoment(moment_id: string): Promise<Moment> {
    const response = await this.env.MOMENTS.fetch(
      `https://internal/api/moments/${moment_id}`
    );

    if (!response.ok) {
      throw new Error(`Moment not found: ${moment_id}`);
    }

    const data = await response.json() as any;
    return data.moment;
  }

  /**
   * Generate script for a single persona using Voice DNA
   */
  async generatePersonaScript(
    moment: Moment,
    persona: Persona,
    platform: Platform
  ): Promise<PersonaScript> {
    const voiceDNA = getVoiceDNA(persona, this.env);

    const userPrompt = `
Parliamentary moment to transform:

QUOTE: "${moment.quote}"
SPEAKER: ${moment.speaker}
TOPIC: ${moment.topic}
CONTEXT: ${moment.context}
PLATFORM: ${platform.toUpperCase()}

Generate a ${platform} script that embodies your Voice DNA. Make it authentic, engaging, and true to your character.
`;

    const startTime = Date.now();

    const completion = await this.openai.chat.completions.create({
      model: this.env.OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: voiceDNA.system_prompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.9, // Higher creativity for authentic voice
      max_tokens: 500,
    });

    const generationTime = Date.now() - startTime;
    const script = completion.choices[0]?.message?.content?.trim() || '';

    // Validate Voice DNA markers
    const validation = validateVoiceDNA(script, persona);

    // Calculate word count and estimated duration
    const wordCount = script.split(/\s+/).length;
    const estimatedDuration = this.estimateDuration(script, persona);

    return {
      persona,
      script,
      word_count: wordCount,
      estimated_duration: estimatedDuration,
      persona_score: validation.score,
    };
  }

  /**
   * Generate scripts for all requested personas in parallel
   */
  async generateAllScripts(
    moment_id: string,
    personas: Persona[],
    platform: Platform
  ): Promise<PersonaScript[]> {
    const moment = await this.getMoment(moment_id);

    // Generate all scripts in parallel
    const scriptPromises = personas.map(persona =>
      this.generatePersonaScript(moment, persona, platform)
    );

    const scripts = await Promise.all(scriptPromises);

    // Validate that all scripts meet minimum requirements
    scripts.forEach(script => {
      if (script.word_count < 80 || script.word_count > 170) {
        console.warn(
          `Script for ${script.persona} has ${script.word_count} words (target: 100-150)`
        );
      }
      if (script.estimated_duration < 25 || script.estimated_duration > 50) {
        console.warn(
          `Script for ${script.persona} has duration ${script.estimated_duration}s (target: 30-45s)`
        );
      }
    });

    return scripts;
  }

  /**
   * Estimate speaking duration based on word count and persona speaking style
   */
  private estimateDuration(script: string, persona: Persona): number {
    const wordCount = script.split(/\s+/).length;

    // Different personas have different speaking speeds
    const wordsPerSecond: Record<Persona, number> = {
      gen_z: 3.5, // Faster, energetic pace
      kopitiam_uncle: 3.2, // Rapid-fire delivery
      auntie: 3.0, // Anxious, rushed pace
      attenborough: 2.5, // Measured, documentary pace
    };

    const baseSpeed = wordsPerSecond[persona];

    // Account for pauses (emoji, punctuation)
    const emojiCount = (script.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
    const exclamationCount = (script.match(/!/g) || []).length;
    const questionCount = (script.match(/\?/g) || []).length;
    const pauseCount = (script.match(/\.\.\./g) || []).length;

    // Add pause time
    const pauseTime = emojiCount * 0.3 + exclamationCount * 0.2 + questionCount * 0.2 + pauseCount * 0.5;

    const duration = wordCount / baseSpeed + pauseTime;

    return Math.round(duration);
  }
}
