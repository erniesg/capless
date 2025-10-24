import { Persona, Moment } from './types';
import { VOICE_DNA_CONFIGS } from './voice-dna';

/**
 * Build a Sora video generation prompt from a moment and script
 *
 * This creates a detailed prompt that describes:
 * 1. The context of the political moment
 * 2. The persona and their characteristics
 * 3. The script content to visualize
 * 4. The visual style and format requirements
 *
 * @param moment - The parliament moment to create a video about
 * @param script - The generated script for this persona
 * @param persona - The persona creating the reaction
 * @returns A detailed prompt string for Sora API
 */
export function buildSoraPrompt(
  moment: Moment,
  script: string,
  persona: Persona
): string {
  const voiceDNA = VOICE_DNA_CONFIGS[persona];

  // Build context section
  const contextSection = buildContextSection(moment);

  // Build persona section
  const personaSection = buildPersonaSection(persona, voiceDNA);

  // Build script section
  const scriptSection = buildScriptSection(script);

  // Build visual style section
  const visualStyleSection = buildVisualStyleSection(persona);

  return `${contextSection}

${personaSection}

${scriptSection}

${visualStyleSection}

Create a compelling, viral-worthy video that brings this political commentary to life with authentic ${voiceDNA.archetype} energy.`;
}

/**
 * Build the context section describing the political moment
 */
function buildContextSection(moment: Moment): string {
  return `CREATE A TIKTOK REACTION VIDEO FOR THIS POLITICAL MOMENT:

MOMENT CONTEXT:
- Speaker: ${moment.speaker}
- Quote: "${moment.quote}"
- Topic: ${moment.topic}
- Emotional Tone: ${moment.emotional_tone}
- Why It's Viral: ${moment.why_viral}
- Target Audience: ${moment.target_demographic}`;
}

/**
 * Build the persona section describing who's reacting
 */
function buildPersonaSection(persona: Persona, voiceDNA: any): string {
  return `PERSONA DELIVERING THE REACTION:
- Persona: ${persona.toUpperCase().replace('_', ' ')}
- Archetype: ${voiceDNA.archetype}
- Driving Force: ${voiceDNA.driving_force}
- Worldview: ${voiceDNA.worldview}
- Validation Style: ${voiceDNA.validation_markers.join(', ')}`;
}

/**
 * Build the script section with the actual content
 */
function buildScriptSection(script: string): string {
  return `SCRIPT TO VISUALIZE:
${script}

SCRIPT NOTES:
- This is a verbal script - visualize the speaker delivering it
- Match visual pacing to the script's emotional beats
- Show the persona's personality through expressions and gestures`;
}

/**
 * Build the visual style section with technical requirements
 */
function buildVisualStyleSection(persona: Persona): string {
  const personaStyles: Record<Persona, string> = {
    gen_z: `VISUAL STYLE (GEN Z):
- Aesthetic: Modern, trendy, TikTok-native
- Color Palette: Vibrant, high-contrast, eye-catching
- Camera Work: Dynamic cuts, trending effects, filters
- Setting: Casual environment (bedroom, coffee shop, urban backdrop)
- Energy Level: High, fast-paced, attention-grabbing
- Text Overlays: Strategic emoji placement, keyword emphasis
- Lighting: Ring light aesthetic, well-lit, professional yet authentic`,

    kopitiam_uncle: `VISUAL STYLE (KOPITIAM UNCLE):
- Aesthetic: Authentic, relatable, everyday Singapore
- Color Palette: Warm, nostalgic, natural tones
- Camera Work: Steady, conversational, eye-level
- Setting: Coffee shop, HDB void deck, or humble backdrop
- Energy Level: Measured, conversational, wise
- Text Overlays: Minimal, focusing on key wisdom
- Lighting: Natural, unpretentious, real`,

    auntie: `VISUAL STYLE (AUNTIE):
- Aesthetic: Concerned, animated, protective
- Color Palette: Warm, familiar, community-oriented
- Camera Work: Intimate, close-up for emphasis
- Setting: Home kitchen, market, familiar community space
- Energy Level: High concern, animated gestures
- Text Overlays: Emphasis on warnings and advice
- Lighting: Warm, homey, inviting yet urgent`,

    attenborough: `VISUAL STYLE (ATTENBOROUGH):
- Aesthetic: Nature documentary, observational
- Color Palette: Natural, cinematic, documentary-grade
- Camera Work: Smooth, observational, wide shots then close-ups
- Setting: Parliament-like setting or natural backdrop
- Energy Level: Calm, measured, profound
- Text Overlays: Scientific labels, species identification humor
- Lighting: Cinematic, dramatic, nature documentary quality`,

    ai_decide: `VISUAL STYLE (AI SELECTED):
- Aesthetic: Adapt to chosen persona
- Color Palette: Match selected voice
- Camera Work: Appropriate to persona
- Setting: Context-dependent
- Energy Level: Match persona energy
- Text Overlays: As appropriate
- Lighting: Match persona requirements`,
  };

  return `${personaStyles[persona]}

TECHNICAL REQUIREMENTS:
- Format: 1080x1920 (vertical, TikTok/Instagram Reels)
- Duration: 10-15 seconds (optimal for engagement)
- Aspect Ratio: 9:16
- Frame Rate: 30fps minimum
- Quality: HD, crisp, professional
- Audio: Clear, balanced, professional voiceover quality
- Captions: Accessible, readable, well-timed`;
}

/**
 * Build a simple prompt for quick testing
 */
export function buildSimplePrompt(
  quote: string,
  persona: Persona,
  duration: number = 15
): string {
  const personaDescriptions: Record<Persona, string> = {
    gen_z: 'a Gen Z TikToker with trendy style and modern energy',
    kopitiam_uncle: 'a wise Singaporean uncle in a kopitiam setting',
    auntie: 'a concerned Singaporean auntie with protective energy',
    attenborough: 'David Attenborough narrating human political behavior',
    ai_decide: 'an AI-selected persona reacting',
  };

  return `Create a ${duration}-second vertical TikTok video (1080x1920) showing ${personaDescriptions[persona]} reacting to this quote:

"${quote}"

Make it engaging, authentic, and viral-worthy with appropriate visual style and energy.`;
}

/**
 * Build a prompt for persona selection (when persona = 'ai_decide')
 */
export function buildPersonaSelectionPrompt(moment: Moment): string {
  return `Analyze this political moment and select the best persona for maximum viral impact:

MOMENT:
- Speaker: ${moment.speaker}
- Quote: "${moment.quote}"
- Topic: ${moment.topic}
- Emotional Tone: ${moment.emotional_tone}
- Why Viral: ${moment.why_viral}
- Target Demographic: ${moment.target_demographic}

AVAILABLE PERSONAS:
1. gen_z - For calling out hypocrisy, absurdity, gaslighting (Truth-Telling Jester)
2. kopitiam_uncle - For practical wisdom, life lessons, "seen it all before" (Seasoned Observer)
3. auntie - For community concern, protective instincts, kiasu energy (Concerned Protector)
4. attenborough - For dramatic political theater, power dynamics, behavioral patterns (Nature Documentary Narrator)

SELECTION CRITERIA:
- Which persona's worldview best matches this moment?
- Which persona would create the strongest emotional connection?
- Which persona's language patterns fit this topic?
- Which persona would maximize shareability?

Return JSON:
{
  "chosen_persona": "gen_z|kopitiam_uncle|auntie|attenborough",
  "reasoning": "2-3 sentences explaining why this persona is optimal",
  "viral_potential": 1-10,
  "emotional_hook": "primary emotion to trigger (anger, humor, concern, wisdom)",
  "key_talking_points": ["point 1", "point 2", "point 3"]
}`;
}

/**
 * Validate that a script matches the persona's voice DNA
 *
 * @param script - The generated script
 * @param persona - The persona it should match
 * @returns Score from 0-1 indicating match quality
 */
export function validateScriptMatchesPersona(
  script: string,
  persona: Persona
): number {
  const voiceDNA = VOICE_DNA_CONFIGS[persona];
  const lowerScript = script.toLowerCase();

  let matchCount = 0;
  let totalMarkers = voiceDNA.validation_markers.length;

  // Count how many validation markers appear in the script
  for (const marker of voiceDNA.validation_markers) {
    if (lowerScript.includes(marker.toLowerCase())) {
      matchCount++;
    }
  }

  // If persona has no validation markers, return 1.0 (always valid)
  if (totalMarkers === 0) {
    return 1.0;
  }

  // Return percentage of markers found
  return matchCount / totalMarkers;
}

/**
 * Extract key metadata from a Sora prompt for logging/debugging
 */
export interface PromptMetadata {
  persona: string;
  topic: string;
  speaker: string;
  duration: number;
  format: string;
  estimated_word_count: number;
}

export function extractPromptMetadata(prompt: string): PromptMetadata {
  // Extract persona
  const personaMatch = prompt.match(/Persona:\s*([A-Z\s]+)/);
  const persona = personaMatch ? personaMatch[1].trim() : 'unknown';

  // Extract topic
  const topicMatch = prompt.match(/Topic:\s*([^\n]+)/);
  const topic = topicMatch ? topicMatch[1].trim() : 'unknown';

  // Extract speaker
  const speakerMatch = prompt.match(/Speaker:\s*([^\n]+)/);
  const speaker = speakerMatch ? speakerMatch[1].trim() : 'unknown';

  // Extract duration
  const durationMatch = prompt.match(/Duration:\s*(\d+)/);
  const duration = durationMatch ? parseInt(durationMatch[1]) : 15;

  // Extract format
  const formatMatch = prompt.match(/Format:\s*([^\n]+)/);
  const format = formatMatch ? formatMatch[1].trim() : '1080x1920';

  // Estimate word count
  const words = prompt.split(/\s+/).length;

  return {
    persona,
    topic,
    speaker,
    duration,
    format,
    estimated_word_count: words,
  };
}
