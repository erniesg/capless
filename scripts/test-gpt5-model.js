#!/usr/bin/env node

/**
 * GPT Model Comparison Test for Gaslighting Detection
 * 
 * Tests a specific GPT model on VTT transcripts to evaluate
 * its ability to detect subtle gaslighting moments like the
 * Jeffrey Siow "13 vs 15" exchange.
 */

import fs from 'fs';
import path from 'path';

const [vttPath, model] = process.argv.slice(2);

if (!vttPath || !model) {
  console.error('Usage: node test-gpt5-model.js <vtt-file-path> <model-name>');
  console.error('Example: node test-gpt5-model.js youtube-transcripts/2025-09-22.en.vtt gpt-5-2025-08-07');
  process.exit(1);
}

// Import constants from main script
const MOMENT_CATEGORIES = [
  { name: "Face Palm Friday", description: "MPs contradicting themselves, outdated tech references, or confusing explanations" },
  { name: "Wholesome Wednesdays", description: "Bipartisan agreement, heartfelt personal stories, or genuine appreciation moments" },
  { name: "Spicy Takes", description: "Bold policy positions, controversial statements, or heated disagreements" },
  { name: "Comedy Gold", description: "Accidental humor, witty comebacks, or funny interruptions" },
  { name: "Mic Drop Mondays", description: "Powerful closing statements, perfectly timed rebuttals, or irrefutable arguments" },
  { name: "Drama Alert", description: "Tense exchanges, raised voices, or visible frustration" },
  { name: "Big Brain Moments", description: "Insightful analysis, expert knowledge, or clever solutions" },
  { name: "Plot Twist", description: "Unexpected announcements, surprise positions, or shocking revelations" },
  { name: "Underdog Wins", description: "Backbenchers getting spotlight, minority voices heard, or junior MPs making impact" },
  { name: "30-Second Parliament", description: "Complete exchange that tells a story in under 30 seconds" },
  { name: "Reality Check", description: "Politicians dismissing concerns, using stats to minimize issues, showing disconnect from public experience, or invalidating people's feelings" }
];

const EXTRACTION_PROMPT = `You are a TikTok content curator for a parliament channel. Extract 5-10 viral moments from this parliament session chunk.

For EACH moment, provide:
1. category: One of ${MOMENT_CATEGORIES.map(c => c.name).join(', ')}
2. title: Catchy 5-10 word headline
3. description: 2-3 sentence explanation of why it's viral
4. speaker: Who said it (name + party if available)
5. quote: COPY THE EXACT WORD-FOR-WORD TEXT from the transcript (max 200 words)
6. viral_score: 1-10 rating of viral potential
7. hook: 1-sentence TikTok caption to grab attention
8. hashtags: 3-5 relevant hashtags

Categories explained:
${MOMENT_CATEGORIES.map(c => `- ${c.name}: ${c.description}`).join('\n')}

Focus on moments that are:
- Relatable to young adults (18-35)
- Self-contained (understandable without context)
- Emotionally engaging (funny, shocking, inspiring)
- Shareable (people would send to friends)

SPECIAL ATTENTION FOR "REALITY CHECK" MOMENTS:
Look for exchanges where politicians show disconnect from public experience:
- Using statistics to minimize legitimate concerns (e.g., "it's only 13 vs 15")
- Meta-commentary dismissing public reactions (e.g., "I was trying to figure out why there was so much attention")
- Invalidating people's feelings about service disruptions or policy impacts
- Good opposition questioning that reveals government weaknesses or out-of-touch attitudes
- Tone-deaf responses that suggest officials don't experience the issues themselves
These moments are HIGHLY viral as they expose political disconnect and validate public frustration.

CRITICAL REQUIREMENT FOR "quote" FIELD:
- DO NOT paraphrase, summarize, or rewrite ANY text
- COPY the text EXACTLY as it appears in the transcript (word-for-word, character-for-character)
- Include the EXACT punctuation, capitalization, and formatting from the source
- The quote will be used for precise timestamp matching in video captions
- If you cannot find the exact text, mark the moment as unusable

Return ONLY valid JSON with a "moments" array. No markdown, no explanation.`;

/**
 * Parse VTT file
 */
function parseVTT(vttContent) {
  const entries = [];
  const lines = vttContent.split('\n');
  let i = 0;

  // Skip header
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.includes('-->')) {
      const [start, end] = line.split('-->').map(t => t.trim().split(' ')[0]);

      i++;
      let text = '';
      while (i < lines.length && lines[i].trim() && !lines[i].includes('-->')) {
        const textLine = lines[i].trim();
        const cleanText = textLine
          .replace(/<[^>]+>/g, ' ')
          .replace(/&gt;&gt;/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleanText) {
          text += (text ? ' ' : '') + cleanText;
        }
        i++;
      }

      if (text) {
        entries.push({ start, end, text });
      }
    } else {
      i++;
    }
  }

  return entries;
}

/**
 * Extract moments using specified model
 */
async function extractMoments(transcriptText, model) {
  const startTime = Date.now();

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert TikTok content curator specializing in political content. You extract viral moments from long-form content.'
          },
          {
            role: 'user',
            content: `${EXTRACTION_PROMPT}\n\nTranscript:\n${transcriptText}`
          }
        ],
        response_format: model.includes('mini') ? { type: 'json_object' } : undefined
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${model} API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    let moments = [];
    try {
      const parsed = JSON.parse(data.choices[0].message.content);
      moments = parsed.moments || [];
    } catch {
      console.log(`  ⚠️  ${model} returned non-JSON response`);
    }

    return {
      model,
      moments,
      usage: data.usage,
      latency_ms: latency
    };
  } catch (error) {
    return {
      model,
      error: error.message,
      latency_ms: Date.now() - startTime
    };
  }
}

/**
 * Find timestamp for quote in VTT
 */
function findTimestampForQuote(quote, vttEntries) {
  const normalizeText = (text) => text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normalizedQuote = normalizeText(quote);
  const quoteWords = normalizedQuote.split(' ').filter(w => w.length > 0);

  let bestMatch = null;
  let bestScore = 0;

  for (let i = 0; i < vttEntries.length; i++) {
    const maxWindowSize = Math.min(30, vttEntries.length - i);

    for (let size = maxWindowSize; size >= 1; size--) {
      const windowEntries = vttEntries.slice(i, i + size);
      const windowText = normalizeText(windowEntries.map(e => e.text).join(' '));

      let score = 0;
      if (windowText.includes(normalizedQuote)) {
        score = 1.0;
      } else {
        const windowWords = windowText.split(' ').filter(w => w.length > 0);
        const windowSet = new Set(windowWords);
        const matchedWords = quoteWords.filter(word => windowSet.has(word));
        score = matchedWords.length / quoteWords.length;
      }

      const minThreshold = quoteWords.length < 10 ? 0.5 : 0.35;

      if (score > bestScore && score >= minThreshold) {
        bestScore = score;
        bestMatch = {
          start: windowEntries[0].start,
          end: windowEntries[windowEntries.length - 1].end,
          matchedText: windowEntries.map(e => e.text).join(' '),
          confidence: score
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Main test function
 */
async function main() {
  console.log(`=== TESTING ${model.toUpperCase()} ===\n`);
  console.log(`VTT file: ${vttPath}\n`);

  // Load and parse VTT
  const vttContent = fs.readFileSync(vttPath, 'utf-8');
  const vttEntries = parseVTT(vttContent);

  console.log(`✅ VTT loaded: ${vttEntries.length} entries`);

  const dateMatch = path.basename(vttPath).match(/(\d{4}-\d{2}-\d{2})/);
  const sessionDate = dateMatch ? dateMatch[1] : 'unknown';

  // Chunk the VTT entries to stay under 50K tokens per request
  const maxCharsPerChunk = 200000; // ~50K tokens
  const chunks = [];
  let currentChunk = [];
  let currentChars = 0;

  for (const entry of vttEntries) {
    const entryChars = entry.text.length;
    if (currentChars + entryChars > maxCharsPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentChars = 0;
    }
    currentChunk.push(entry);
    currentChars += entryChars;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  console.log(`📦 Split into ${chunks.length} chunks (max ${(maxCharsPerChunk / 1000).toFixed(0)}K chars each)\n`);

  // Extract moments from each chunk
  console.log('=== EXTRACTING MOMENTS ===\n');
  const allMoments = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkText = chunk.map(e => e.text).join(' ');

    console.log(`\n  === CHUNK ${i + 1}/${chunks.length} ===`);
    console.log(`  Size: ${(chunkText.length / 1000).toFixed(1)}K chars (~${(chunkText.length / 4000).toFixed(1)}K tokens)`);

    const result = await extractMoments(chunkText, model);

    if (result.error) {
      console.log(`  ❌ Failed: ${result.error}`);
    } else {
      console.log(`  ✅ Extracted ${result.moments.length} moments`);
      console.log(`  Latency: ${(result.latency_ms / 1000).toFixed(2)}s`);
      allMoments.push(...(result.moments || []));
    }
  }

  console.log(`\n📊 Total moments extracted: ${allMoments.length}`);

  // Match timestamps
  console.log('\n=== TIMESTAMP MATCHING ===\n');

  for (const moment of allMoments) {
    const match = findTimestampForQuote(moment.quote, vttEntries);
    if (match) {
      moment.timestamp_start = match.start;
      moment.timestamp_end = match.end;
      moment.timestamp_confidence = match.confidence;
      console.log(`✅ "${moment.title}" → ${match.start} [${moment.category}]`);
    } else {
      console.log(`❌ "${moment.title}" - NO MATCH`);
    }
  }

  const matched = allMoments.filter(m => m.timestamp_start).length;
  console.log(`\n📊 Match rate: ${matched}/${allMoments.length} (${((matched / allMoments.length) * 100).toFixed(1)}%)`);

  // Count Reality Check moments
  const realityChecks = allMoments.filter(m => m.category === 'Reality Check');
  console.log(`\n🎯 Reality Check moments: ${realityChecks.length}`);
  if (realityChecks.length > 0) {
    console.log('\nReality Check moments found:');
    realityChecks.forEach(m => {
      console.log(`  - "${m.title}"`);
      console.log(`    Quote preview: ${m.quote.substring(0, 100)}...`);
    });
  }

  // Save results
  const modelSafe = model.replace(/[^a-z0-9]/gi, '-');
  const outputPath = `/Users/erniesg/code/erniesg/capless/test-outputs/moment-extraction/${sessionDate}-${modelSafe}.json`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const results = {
    model,
    session_date: sessionDate,
    vtt_file: vttPath,
    vtt_entries: vttEntries.length,
    chunks: chunks.length,
    moments: allMoments,
    matched_moments: matched,
    match_rate: ((matched / allMoments.length) * 100).toFixed(1),
    reality_check_count: realityChecks.length
  };

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${outputPath}`);
}

main().catch(console.error);
