#!/usr/bin/env node
// ACTUALLY test 22 Sep 2025 YouTube transcript (not the hardcoded 05-09-2025!)

import fs from 'fs';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

console.log('=== TESTING ACTUAL 22 SEP 2025 YOUTUBE TRANSCRIPT ===\n');

const vttFile = '/Users/erniesg/code/erniesg/capless/youtube-transcripts/2025-09-22.en.vtt';

// Check if VTT exists
if (!fs.existsSync(vttFile)) {
  console.error('❌ VTT file not found:', vttFile);
  process.exit(1);
}

const vttContent = fs.readFileSync(vttFile, 'utf-8');
console.log(`✅ VTT loaded: ${(vttContent.length / 1024 / 1024).toFixed(2)} MB`);

// Parse VTT entries
const lines = vttContent.split('\n');
const entries = [];
let currentEntry = null;

for (const line of lines) {
  const timestampMatch = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/);

  if (timestampMatch) {
    if (currentEntry && currentEntry.text) {
      entries.push(currentEntry);
    }
    currentEntry = {
      start: timestampMatch[1],
      end: timestampMatch[2],
      text: ''
    };
  } else if (currentEntry && line.trim() && !line.startsWith('WEBVTT') && !/^\d+$/.test(line)) {
    currentEntry.text += (currentEntry.text ? ' ' : '') + line.trim();
  }
}

if (currentEntry && currentEntry.text) {
  entries.push(currentEntry);
}

console.log(`✅ Parsed ${entries.length} VTT entries\n`);

// Convert to full transcript text
const transcriptText = entries.map(e => e.text).join(' ');
console.log(`Transcript length: ${transcriptText.length} characters (${Math.ceil(transcriptText.length / 4)} tokens approx)\n`);

// Function to find matching timestamp
function findMatchingTimestamp(quote, entries) {
  const normalizeText = (text) => text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normalizedQuote = normalizeText(quote);
  const quoteWords = normalizedQuote.split(' ');

  // Try to find a fuzzy match (at least 70% word overlap)
  for (let i = 0; i < entries.length; i++) {
    const normalizedEntry = normalizeText(entries[i].text);
    const entryWords = normalizedEntry.split(' ');

    // Check word overlap
    const matchingWords = quoteWords.filter(word =>
      word.length > 3 && normalizedEntry.includes(word)
    ).length;

    const matchRatio = matchingWords / Math.max(quoteWords.length, 1);

    if (matchRatio >= 0.7) {
      return {
        start: entries[i].start,
        end: entries[Math.min(i + 5, entries.length - 1)].end, // Include context
        text: entries.slice(i, Math.min(i + 6, entries.length)).map(e => e.text).join(' ')
      };
    }
  }

  return null;
}

async function testGPT5Models() {
  console.log('=== TESTING GPT-5 MODELS ON 22 SEP 2025 ===\n');

  const systemPrompt = `You are analyzing a Singapore Parliament session transcript to extract viral-worthy moments.

Extract 5-8 moments that would perform well on TikTok/Instagram Reels. Focus on:
- Witty comebacks or funny exchanges
- Dramatic policy announcements
- Heated debates or confrontations
- Surprising statistics or revelations
- Emotional appeals
- Technical glitches or awkward moments

For each moment, provide:
1. category: One of ["Clapback Moments", "Big Brain Moments", "Savage Replies", "Awkward Moments", "Plot Twists"]
2. title: Catchy, clickbait-style title (max 60 chars)
3. description: One sentence summary
4. speaker: Who said it
5. quote: Exact quote from transcript (CRITICAL: must be verbatim!)
6. viral_score: 1-10 rating

Return ONLY valid JSON array with no other text.`;

  const userPrompt = `Analyze this 22 Sep 2025 parliament session and extract viral moments:\n\n${transcriptText}`;

  const models = [
    { name: 'GPT-5-mini', model: 'gpt-5-mini' },
    { name: 'GPT-5-nano', model: 'gpt-5-nano' }
  ];

  const results = {};

  for (const { name, model } of models) {
    console.log(`\n=== Testing ${name} ===`);
    const startTime = Date.now();

    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7
      });

      const latency = ((Date.now() - startTime) / 1000).toFixed(2);
      const content = response.choices[0].message.content;

      // Parse JSON (handle both array and object with moments key)
      let moments;
      try {
        const parsed = JSON.parse(content);
        moments = Array.isArray(parsed) ? parsed : (parsed.moments || []);
      } catch (e) {
        console.error(`❌ ${name} failed: Invalid JSON`);
        console.error('Response:', content.substring(0, 500));
        results[name] = { error: 'Invalid JSON', moments: [] };
        continue;
      }

      console.log(`✅ ${name} extracted ${moments.length} moments`);
      console.log(`   Tokens: ${response.usage.prompt_tokens} input + ${response.usage.completion_tokens} output`);
      console.log(`   Latency: ${latency}s`);

      // Match timestamps
      console.log('\n=== Timestamp Matching ===');
      let matched = 0;

      for (let i = 0; i < moments.length; i++) {
        const moment = moments[i];
        const timestamp = findMatchingTimestamp(moment.quote, entries);

        if (timestamp) {
          moment.timestamp_start = timestamp.start;
          moment.timestamp_end = timestamp.end;
          matched++;
          console.log(`✅ Moment ${i + 1}: "${moment.title}" → ${timestamp.start}`);
        } else {
          moment.timestamp_error = 'No matching text found in VTT';
          console.log(`❌ Moment ${i + 1}: "${moment.title}" - NO MATCH`);
        }
      }

      console.log(`\n📊 Match rate: ${matched}/${moments.length} (${((matched / moments.length) * 100).toFixed(1)}%)`);

      results[name] = {
        success: true,
        moments,
        matched,
        total: moments.length,
        match_rate: ((matched / moments.length) * 100).toFixed(1),
        latency,
        tokens: response.usage
      };

    } catch (error) {
      console.error(`❌ ${name} failed:`, error.message);
      results[name] = { error: error.message, moments: [] };
    }
  }

  // Save results
  const outputDir = '/Users/erniesg/code/erniesg/capless/test-outputs/moment-extraction';
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    `${outputDir}/22-sep-2025-ACTUAL-results.json`,
    JSON.stringify(results, null, 2)
  );

  console.log('\n\n=== SUMMARY ===');
  console.log('Session: 22 Sep 2025 (ACTUAL VTT file)');
  for (const [model, result] of Object.entries(results)) {
    if (result.error) {
      console.log(`\n${model}: ❌ FAILED - ${result.error}`);
    } else {
      console.log(`\n${model}:`);
      console.log(`  Moments: ${result.total}`);
      console.log(`  Matched: ${result.matched} (${result.match_rate}%)`);
      console.log(`  Latency: ${result.latency}s`);
      console.log(`  Tokens: ${result.tokens.prompt_tokens} + ${result.tokens.completion_tokens}`);
    }
  }

  console.log(`\n💾 Results saved to: ${outputDir}/22-sep-2025-ACTUAL-results.json`);
}

testGPT5Models().catch(console.error);
