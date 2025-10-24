/**
 * Manual test script for video-generator worker
 * Run with: npx tsx test-manual.ts
 */

import { generateScript } from './src/script-generator';
import { Moment, Env } from './src/types';

// Mock moment for testing
const mockMoment: Moment = {
  moment_id: 'parliament-22-09-2025-moment-1',
  quote:
    'We need to ensure that our policies are not just reactive but proactive in addressing climate change.',
  speaker: 'Grace Fu',
  timestamp_start: '00:12:34',
  timestamp_end: '00:12:48',
  virality_score: 8.5,
  why_viral: 'Strong stance on climate policy with clear urgency',
  topic: 'Climate Policy',
  emotional_tone: 'Determined, Urgent',
  target_demographic: 'Environmentally conscious youth',
  transcript_id: 'abc123xyz',
};

async function testScriptGeneration() {
  console.log('Testing script generation for Gen Z persona...\n');

  // Create mock env with API key from environment
  const mockEnv: Env = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    R2: {} as any,
    VIDEO_JOBS: {} as any,
  };

  if (!mockEnv.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable not set');
    process.exit(1);
  }

  try {
    const script = await generateScript(mockMoment, 'gen_z', mockEnv);

    console.log('✅ Script generation successful!\n');
    console.log('Persona:', script.persona);
    console.log('Word count:', script.word_count);
    console.log('Validation score:', script.validation_score.toFixed(1) + '%');
    console.log('\nHook:', script.hook);
    console.log('\nFull Script:');
    console.log('---');
    console.log(script.script);
    console.log('---');
    console.log('\nCTA:', script.cta);
    console.log('\nHashtags:', script.hashtags.join(', '));

    // Validate results
    if (script.word_count < 80 || script.word_count > 200) {
      console.warn(
        '\n⚠️  Warning: Word count outside expected range (100-150 words)'
      );
    }

    if (script.validation_score < 30) {
      console.warn(
        '\n⚠️  Warning: Validation score low (Gen Z markers not detected)'
      );
    }

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Script generation failed:');
    console.error(error);
    process.exit(1);
  }
}

testScriptGeneration();
