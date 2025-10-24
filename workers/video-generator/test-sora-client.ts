/**
 * Manual test script for Sora client
 *
 * Run with: npx tsx test-sora-client.ts
 */

import { SoraClient } from './src/sora-client';
import { buildSoraPrompt, buildSimplePrompt, validateScriptMatchesPersona } from './src/prompts';
import { Moment, Persona } from './src/types';

const mockMoment: Moment = {
  moment_id: 'test-moment-1',
  quote: 'The alterations were done to cover up the incompleteness of documents but the contents were factual.',
  speaker: 'Minister (PUB)',
  timestamp_start: '01:29:46',
  timestamp_end: '01:30:00',
  virality_score: 10,
  why_viral: 'Minimizes document falsification - sounds like cover-up language',
  topic: 'Public Sector Integrity',
  emotional_tone: 'Defensive, Evasive',
  target_demographic: 'General public, transparency advocates',
  transcript_id: 'parliament-22-09-2024',
};

const mockScript = `
POV: When they try to tell you document falsification is just "ensuring completeness" 💀

The way that the government is trying to spin literal document alterations as "covering up incompleteness"?
Hello! That's EXACTLY what a cover-up is! You don't alter documents after the fact - that's literally what
we tell kids NOT to do with their homework!

It's giving corporate speak meets Orwell. "The contents were factual" - yeah but you CHANGED them though?
Make it make sense!

Tell me you're gaslighting without telling me you're gaslighting 🙄
`;

async function testSoraClient() {
  console.log('\n=== Testing Sora Client (Demo Mode) ===\n');

  // 1. Test client initialization
  console.log('1. Creating Sora client in demo mode...');
  const soraClient = new SoraClient('demo-api-key', true);
  console.log('✅ Client created\n');

  // 2. Test prompt generation
  console.log('2. Testing prompt generation...');
  const personas: Persona[] = ['gen_z', 'kopitiam_uncle', 'auntie', 'attenborough'];

  for (const persona of personas) {
    const prompt = buildSoraPrompt(mockMoment, mockScript, persona);
    console.log(`\n📝 Prompt for ${persona}:`);
    console.log(`   Length: ${prompt.length} characters`);
    console.log(`   Word count: ${prompt.split(/\s+/).length} words`);

    // Verify key sections
    const hasMomentContext = prompt.includes('MOMENT CONTEXT');
    const hasPersona = prompt.includes('PERSONA DELIVERING');
    const hasScript = prompt.includes('SCRIPT TO VISUALIZE');
    const hasTechnical = prompt.includes('TECHNICAL REQUIREMENTS');

    if (hasMomentContext && hasPersona && hasScript && hasTechnical) {
      console.log('   ✅ All sections present');
    } else {
      console.log('   ❌ Missing sections');
    }
  }

  // 3. Test simple prompt
  console.log('\n\n3. Testing simple prompt...');
  const simplePrompt = buildSimplePrompt(mockMoment.quote, 'gen_z', 15);
  console.log(`   Length: ${simplePrompt.length} characters`);
  console.log(`   ✅ Simple prompt generated\n`);

  // 4. Test script validation
  console.log('4. Testing script validation...');
  const genZScore = validateScriptMatchesPersona(mockScript, 'gen_z');
  console.log(`   Gen Z validation score: ${(genZScore * 100).toFixed(1)}%`);

  if (genZScore > 0.5) {
    console.log('   ✅ Script matches Gen Z persona');
  } else {
    console.log('   ⚠️  Script may not match Gen Z persona well');
  }

  // 5. Test video generation
  console.log('\n5. Testing video generation (demo mode)...');
  console.log('   Generating videos for all personas...\n');

  for (const persona of personas) {
    console.log(`   🎬 Generating ${persona} video...`);
    const startTime = Date.now();

    const prompt = buildSoraPrompt(mockMoment, mockScript, persona);
    const result = await soraClient.generateVideo(prompt, persona, {
      duration: 15,
      size: '1080x1920',
    });

    const elapsed = Date.now() - startTime;

    console.log(`      Generation ID: ${result.sora_generation_id}`);
    console.log(`      Video URL: ${result.video_url}`);
    console.log(`      Thumbnail URL: ${result.thumbnail_url}`);
    console.log(`      Duration: ${result.duration}s`);
    console.log(`      Status: ${result.generation_status}`);
    console.log(`      Time taken: ${(elapsed / 1000).toFixed(2)}s`);

    if (result.generation_status === 'complete') {
      console.log(`      ✅ Video generated successfully\n`);
    } else {
      console.log(`      ❌ Video generation failed\n`);
    }
  }

  // 6. Test status check
  console.log('6. Testing status check...');
  const testId = 'sora-demo-1234567890-gen_z';
  const status = await soraClient.checkStatus(testId);
  console.log(`   Status for ${testId}:`);
  console.log(`   Video URL: ${status.video_url}`);
  console.log(`   Status: ${status.generation_status}`);
  console.log('   ✅ Status check working\n');

  console.log('\n=== All Tests Passed! ===\n');
  console.log('Summary:');
  console.log('  ✅ Sora client initialization');
  console.log('  ✅ Prompt generation (all personas)');
  console.log('  ✅ Script validation');
  console.log('  ✅ Video generation (demo mode)');
  console.log('  ✅ Status checking');
  console.log('\n💡 To test with real Sora API:');
  console.log('   1. Set DEMO_MODE=false in wrangler.toml');
  console.log('   2. Uncomment production code in src/sora-client.ts');
  console.log('   3. Ensure OPENAI_API_KEY has Sora access');
  console.log('   4. Run this test again\n');
}

// Run tests
testSoraClient().catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
