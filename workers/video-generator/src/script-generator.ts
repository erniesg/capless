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

Generate a 10-15 second TikTok reaction script (100-150 words).`;

  // Use Tool Use pattern for structured output
  const tools: Anthropic.Tool[] = [
    {
      name: 'generate_script',
      description: 'Generate a TikTok script with hook, main content, call-to-action, and hashtags',
      input_schema: {
        type: 'object',
        properties: {
          script: {
            type: 'string',
            description: 'The full TikTok script text (100-150 words)'
          },
          hook: {
            type: 'string',
            description: 'The opening hook line (first 3 seconds)'
          },
          cta: {
            type: 'string',
            description: 'Call to action or final zinger'
          },
          hashtags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of relevant hashtags (without # symbol)'
          }
        },
        required: ['script', 'hook', 'cta', 'hashtags']
      }
    }
  ];

  const message = await claude.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: prompt
    }],
    tools,
    tool_choice: { type: 'tool', name: 'generate_script' },
    temperature: 0
  });

  // Extract tool use response
  const toolUse = message.content.find(block => block.type === 'tool_use');

  if (!toolUse || toolUse.type !== 'tool_use') {
    console.error('Unexpected response from Claude:', message.content);
    throw new Error('Claude did not return a tool_use response');
  }

  const parsed = toolUse.input as {
    script: string;
    hook: string;
    cta: string;
    hashtags: string[];
  };

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
