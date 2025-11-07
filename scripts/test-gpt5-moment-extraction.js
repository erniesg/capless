#!/usr/bin/env node

/**
 * GPT-5-mini vs GPT-5-nano Moment Extraction Comparison
 *
 * Tests both OpenAI models on parliament transcripts to extract viral TikTok moments
 * Compares:
 * - Quality of extracted moments
 * - Cost efficiency
 * - Speed/latency
 * - Context handling
 *
 * GPT-5-mini specs:
 * - Context: 400K tokens
 * - Output: 128K tokens max
 * - Pricing: $0.25 input / $2.00 output per 1M tokens
 * - Reasoning support: Yes
 */

import fs from 'fs';
import path from 'path';

// TikTok viral moment categories
const MOMENT_CATEGORIES = [
  {
    name: "Face Palm Friday",
    description: "MPs contradicting themselves, outdated tech references, or confusing explanations"
  },
  {
    name: "Wholesome Wednesdays",
    description: "Bipartisan agreement, heartfelt personal stories, or genuine appreciation moments"
  },
  {
    name: "Spicy Takes",
    description: "Bold policy positions, controversial statements, or heated disagreements"
  },
  {
    name: "Comedy Gold",
    description: "Accidental humor, witty comebacks, or funny interruptions"
  },
  {
    name: "Mic Drop Mondays",
    description: "Powerful closing statements, perfectly timed rebuttals, or irrefutable arguments"
  },
  {
    name: "Drama Alert",
    description: "Tense exchanges, raised voices, or visible frustration"
  },
  {
    name: "Big Brain Moments",
    description: "Insightful analysis, expert knowledge, or clever solutions"
  },
  {
    name: "Plot Twist",
    description: "Unexpected announcements, surprise positions, or shocking revelations"
  },
  {
    name: "Underdog Wins",
    description: "Backbenchers getting spotlight, minority voices heard, or junior MPs making impact"
  },
  {
    name: "30-Second Parliament",
    description: "Complete exchange that tells a story in under 30 seconds"
  }
];

const EXTRACTION_PROMPT = `You are a TikTok content curator for a parliament channel. Extract 5-10 viral moments from this parliament session.

For EACH moment, provide:
1. category: One of ${MOMENT_CATEGORIES.map(c => c.name).join(', ')}
2. title: Catchy 5-10 word headline
3. description: 2-3 sentence explanation of why it's viral
4. speaker: Who said it (name + party if available)
5. quote: The actual quote or exchange (max 200 words)
6. timestamp_hint: Approximate location in transcript (beginning/middle/end, or speaker cue)
7. viral_score: 1-10 rating of viral potential
8. hook: 1-sentence TikTok caption to grab attention
9. hashtags: 3-5 relevant hashtags

Categories explained:
${MOMENT_CATEGORIES.map(c => `- ${c.name}: ${c.description}`).join('\n')}

Focus on moments that are:
- Relatable to young adults (18-35)
- Self-contained (understandable without context)
- Emotionally engaging (funny, shocking, inspiring)
- Shareable (people would send to friends)

Return ONLY valid JSON array of moments. No markdown, no explanation.`;

async function extractMomentsGPT5Mini(transcript) {
  const startTime = Date.now();

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert TikTok content curator specializing in political content. You extract viral moments from long-form content.'
          },
          {
            role: 'user',
            content: `${EXTRACTION_PROMPT}\n\nTranscript:\n${JSON.stringify(transcript)}`
          }
        ],
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GPT-5-mini API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    return {
      model: 'gpt-5-mini',
      moments: JSON.parse(data.choices[0].message.content),
      usage: data.usage,
      cost: calculateCost(data.usage, 'gpt-5-mini'),
      latency_ms: latency
    };
  } catch (error) {
    return {
      model: 'gpt-5-mini',
      error: error.message,
      latency_ms: Date.now() - startTime
    };
  }
}

async function extractMomentsGPT5Nano(transcript) {
  const startTime = Date.now();

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5-nano',
        messages: [
          {
            role: 'system',
            content: 'You are an expert TikTok content curator specializing in political content. You extract viral moments from long-form content.'
          },
          {
            role: 'user',
            content: `${EXTRACTION_PROMPT}\n\nTranscript:\n${JSON.stringify(transcript)}`
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GPT-5-nano API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    return {
      model: 'gpt-5-nano',
      moments: JSON.parse(data.choices[0].message.content),
      usage: data.usage,
      cost: calculateCost(data.usage, 'gpt-5-nano'),
      latency_ms: latency
    };
  } catch (error) {
    return {
      model: 'gpt-5-nano',
      error: error.message,
      latency_ms: Date.now() - startTime
    };
  }
}

function calculateCost(usage, model) {
  if (model === 'gpt-5-mini') {
    // $0.25 per 1M input tokens, $2.00 per 1M output tokens
    const inputCost = (usage.prompt_tokens / 1_000_000) * 0.25;
    const outputCost = (usage.completion_tokens / 1_000_000) * 2.00;
    return {
      input_cost: inputCost,
      output_cost: outputCost,
      total_cost: inputCost + outputCost,
      input_tokens: usage.prompt_tokens,
      output_tokens: usage.completion_tokens
    };
  } else if (model === 'gpt-5-nano') {
    // Pricing TBD - placeholder
    return {
      input_cost: 0,
      output_cost: 0,
      total_cost: 0,
      input_tokens: usage.prompt_tokens,
      output_tokens: usage.completion_tokens,
      note: "GPT-5-nano pricing not yet available"
    };
  }
}

async function runComparison(transcriptPaths) {
  console.log('=== GPT-5-MINI VS GPT-5-NANO MOMENT EXTRACTION ===\n');
  console.log(`Testing on ${transcriptPaths.length} parliament sessions\n`);

  const results = [];

  for (const transcriptPath of transcriptPaths) {
    console.log(`\nProcessing: ${path.basename(transcriptPath)}`);

    const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8'));
    const date = path.basename(transcriptPath, '.json');

    console.log(`  Session date: ${transcript.metadata?.sittingDate || date}`);
    console.log(`  Testing GPT-5-mini...`);

    const miniResult = await extractMomentsGPT5Mini(transcript);

    if (miniResult.error) {
      console.log(`  ❌ GPT-5-mini failed: ${miniResult.error}`);
    } else {
      console.log(`  ✅ GPT-5-mini extracted ${miniResult.moments?.moments?.length || 0} moments`);
      console.log(`     Cost: $${miniResult.cost.total_cost.toFixed(6)} (${miniResult.cost.input_tokens} input + ${miniResult.cost.output_tokens} output tokens)`);
      console.log(`     Latency: ${(miniResult.latency_ms / 1000).toFixed(2)}s`);
    }

    console.log(`  Testing GPT-5-nano...`);

    const nanoResult = await extractMomentsGPT5Nano(transcript);

    if (nanoResult.error) {
      console.log(`  ❌ GPT-5-nano failed: ${nanoResult.error}`);
    } else {
      console.log(`  ✅ GPT-5-nano extracted ${nanoResult.moments?.moments?.length || 0} moments`);
      console.log(`     Cost: ${nanoResult.cost.note || `$${nanoResult.cost.total_cost.toFixed(6)}`} (${nanoResult.cost.input_tokens} input + ${nanoResult.cost.output_tokens} output tokens)`);
      console.log(`     Latency: ${(nanoResult.latency_ms / 1000).toFixed(2)}s`);
    }

    results.push({
      session: date,
      metadata: transcript.metadata,
      gpt5_mini: miniResult,
      gpt5_nano: nanoResult
    });

    // Save individual results
    const outputPath = `/Users/erniesg/code/erniesg/capless/test-outputs/moment-extraction/${date}-comparison.json`;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(results[results.length - 1], null, 2));
    console.log(`  💾 Saved to: ${outputPath}`);
  }

  // Generate summary report
  console.log('\n\n=== COMPARISON SUMMARY ===\n');

  const summary = {
    total_sessions: results.length,
    gpt5_mini: {
      successful: results.filter(r => !r.gpt5_mini.error).length,
      failed: results.filter(r => r.gpt5_mini.error).length,
      total_cost: results.reduce((sum, r) => sum + (r.gpt5_mini.cost?.total_cost || 0), 0),
      avg_moments: results.filter(r => !r.gpt5_mini.error).reduce((sum, r) => sum + (r.gpt5_mini.moments?.moments?.length || 0), 0) / results.filter(r => !r.gpt5_mini.error).length,
      avg_latency_s: results.filter(r => !r.gpt5_mini.error).reduce((sum, r) => sum + r.gpt5_mini.latency_ms, 0) / results.filter(r => !r.gpt5_mini.error).length / 1000
    },
    gpt5_nano: {
      successful: results.filter(r => !r.gpt5_nano.error).length,
      failed: results.filter(r => r.gpt5_nano.error).length,
      total_cost: results.reduce((sum, r) => sum + (r.gpt5_nano.cost?.total_cost || 0), 0),
      avg_moments: results.filter(r => !r.gpt5_nano.error).reduce((sum, r) => sum + (r.gpt5_nano.moments?.moments?.length || 0), 0) / results.filter(r => !r.gpt5_nano.error).length,
      avg_latency_s: results.filter(r => !r.gpt5_nano.error).reduce((sum, r) => sum + r.gpt5_nano.latency_ms, 0) / results.filter(r => !r.gpt5_nano.error).length / 1000
    },
    results: results
  };

  console.log('GPT-5-mini:');
  console.log(`  Success: ${summary.gpt5_mini.successful}/${results.length}`);
  console.log(`  Total cost: $${summary.gpt5_mini.total_cost.toFixed(4)}`);
  console.log(`  Avg moments extracted: ${summary.gpt5_mini.avg_moments.toFixed(1)}`);
  console.log(`  Avg latency: ${summary.gpt5_mini.avg_latency_s.toFixed(2)}s`);

  console.log('\nGPT-5-nano:');
  console.log(`  Success: ${summary.gpt5_nano.successful}/${results.length}`);
  console.log(`  Total cost: ${summary.gpt5_nano.total_cost > 0 ? `$${summary.gpt5_nano.total_cost.toFixed(4)}` : 'TBD'}`);
  console.log(`  Avg moments extracted: ${summary.gpt5_nano.avg_moments.toFixed(1)}`);
  console.log(`  Avg latency: ${summary.gpt5_nano.avg_latency_s.toFixed(2)}s`);

  // Save summary
  const summaryPath = '/Users/erniesg/code/erniesg/capless/test-outputs/moment-extraction/comparison-summary.json';
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\n💾 Summary saved to: ${summaryPath}`);

  return summary;
}

// Main execution
async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable not set');
    process.exit(1);
  }

  // Test on 3 sample sessions from different eras
  const testSessions = [
    '/tmp/transcript-samples/2025.json',     // 2020s - new format
    '/tmp/transcript-samples/2008.json',     // 2000s - old format
    '/tmp/transcript-samples/1984.json'      // 1980s - old format
  ];

  // Filter to existing files
  const existingSessions = testSessions.filter(path => {
    try {
      fs.accessSync(path);
      return true;
    } catch {
      console.log(`⚠️  Skipping ${path} (not found)`);
      return false;
    }
  });

  if (existingSessions.length === 0) {
    console.error('❌ No test sessions found. Please run sample-transcripts-by-decade.sh first.');
    process.exit(1);
  }

  await runComparison(existingSessions);
}

main().catch(console.error);
