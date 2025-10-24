import Anthropic from '@anthropic-ai/sdk';
import { Moment, GeneratedScript, Persona, Env } from './types';
import { VOICE_DNA_CONFIGS } from './voice-dna';

export async function generateScript(
  moment: Moment,
  persona: Persona,
  env: Env
): Promise<GeneratedScript> {
  const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const voiceDNA = VOICE_DNA_CONFIGS[persona];

  const prompt = `${voiceDNA.system_prompt}

MOMENT TO REACT TO:
Speaker: ${moment.speaker}
Quote: "${moment.quote}"
Context: ${moment.why_viral}
Topic: ${moment.topic}
Emotional Tone: ${moment.emotional_tone}
Target Demo: ${moment.target_demographic}

Generate a 10-15 second TikTok reaction script (100-150 words).`;

  const message = await claude.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  const responseText = message.content[0].type === 'text'
    ? message.content[0].text
    : '';

  // Parse JSON response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse script JSON from Claude response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Calculate word count
  const wordCount = parsed.script.split(/\s+/).length;

  // Calculate validation score
  const validationScore = calculateValidationScore(
    parsed.script,
    voiceDNA.validation_markers
  );

  return {
    persona,
    script: parsed.script,
    hook: parsed.hook,
    cta: parsed.cta,
    hashtags: parsed.hashtags || [],
    word_count: wordCount,
    validation_score: validationScore
  };
}

function calculateValidationScore(
  script: string,
  markers: string[]
): number {
  const lowerScript = script.toLowerCase();
  const foundMarkers = markers.filter(marker =>
    lowerScript.includes(marker.toLowerCase())
  );
  return markers.length > 0
    ? (foundMarkers.length / markers.length) * 100
    : 100;
}
