#!/usr/bin/env node

/**
 * Production Script: Extract Viral Moments from ALL YouTube Transcripts
 *
 * Features:
 * - Uses GPT-5-mini (gpt-5-mini-2024-07-18) with 500K TPM limit
 * - Processes transcripts in reverse chronological order (newest first)
 * - Handles R2 pagination for 1700+ sessions
 * - Resumable: skips already-processed transcripts
 * - Rate limiting: respects 500 RPM, 500K TPM
 * - Stores results in R2: moment-extraction/{date}.json
 * - Progress tracking with detailed logging
 */

import fs from 'fs';
import { execSync } from 'child_process';

const MODEL = 'gpt-5-mini-2024-07-18';
const OUTPUT_DIR = '/Users/erniesg/code/erniesg/capless/test-outputs/moment-extraction';
const LOG_FILE = '/tmp/gpt5mini-moment-extraction.log';

// Rate limiting (conservative to avoid hitting limits)
const MAX_REQUESTS_PER_MINUTE = 450; // 500 RPM limit, use 450 to be safe
const MAX_TOKENS_PER_MINUTE = 450000; // 500K TPM limit, use 450K to be safe
const APPROX_TOKENS_PER_CHUNK = 51000; // ~50K tokens per chunk
const MAX_CHUNKS_PER_MINUTE = Math.floor(MAX_TOKENS_PER_MINUTE / APPROX_TOKENS_PER_CHUNK); // ~8 chunks/min

// Import extraction logic from test script
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
 * List all YouTube transcripts in R2 with pagination
 */
function listAllTranscriptsInR2() {
  console.log('📋 Listing all YouTube transcripts in R2...');

  const transcripts = [];
  let cursor = null;
  let page = 1;

  while (true) {
    const cmd = cursor
      ? `npx wrangler r2 object list capless-preview --prefix youtube/transcripts/ --cursor "${cursor}" 2>&1`
      : `npx wrangler r2 object list capless-preview --prefix youtube/transcripts/ 2>&1`;

    const output = execSync(cmd, { encoding: 'utf-8' });

    // Extract dates from output (format: youtube/transcripts/YYYY-MM-DD.vtt)
    const dateMatches = output.match(/youtube\/transcripts\/(\d{4}-\d{2}-\d{2})\.vtt/g);
    if (dateMatches) {
      dateMatches.forEach(match => {
        const date = match.match(/(\d{4}-\d{2}-\d{2})/)[1];
        if (!transcripts.includes(date)) {
          transcripts.push(date);
        }
      });
    }

    // Check for cursor (pagination)
    const cursorMatch = output.match(/"cursor":\s*"([^"]+)"/);
    if (cursorMatch) {
      cursor = cursorMatch[1];
      console.log(`  Page ${page}: Found ${transcripts.length} transcripts (continuing...)`);
      page++;
    } else {
      break;
    }
  }

  // Sort in reverse chronological order (newest first)
  transcripts.sort((a, b) => b.localeCompare(a));

  console.log(`✅ Found ${transcripts.length} YouTube transcripts in R2`);
  return transcripts;
}

/**
 * Check if moment extraction already exists
 */
function hasExistingMomentExtraction(date) {
  const localPath = `${OUTPUT_DIR}/${date}-gpt-5-mini.json`;
  return fs.existsSync(localPath);
}

/**
 * Download VTT from R2
 */
function downloadVTTFromR2(date) {
  const localPath = `/tmp/${date}.vtt`;

  if (fs.existsSync(localPath)) {
    return localPath; // Already downloaded
  }

  try {
    execSync(
      `npx wrangler r2 object get capless-preview/youtube/transcripts/${date}.vtt --file ${localPath}`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    return localPath;
  } catch (error) {
    console.error(`  ❌ Failed to download VTT: ${error.message}`);
    return null;
  }
}

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
 * Extract moments using GPT-5-mini
 */
async function extractMoments(transcriptText) {
  const startTime = Date.now();

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
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
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    let moments = [];
    try {
      const parsed = JSON.parse(data.choices[0].message.content);
      moments = parsed.moments || [];
    } catch {
      console.log(`  ⚠️  Non-JSON response`);
    }

    return {
      moments,
      usage: data.usage,
      latency_ms: latency
    };
  } catch (error) {
    return {
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
 * Upload result to R2
 */
function uploadResultToR2(date, resultPath) {
  try {
    execSync(
      `npx wrangler r2 object put capless-preview/moment-extraction/${date}.json --file ${resultPath}`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    return true;
  } catch (error) {
    console.error(`  ⚠️  Failed to upload to R2: ${error.message}`);
    return false;
  }
}

/**
 * Process single transcript
 */
async function processTranscript(date) {
  console.log(`\n=== PROCESSING ${date} ===`);

  // Download VTT
  console.log('  Downloading VTT from R2...');
  const vttPath = downloadVTTFromR2(date);
  if (!vttPath) {
    return { date, status: 'failed', reason: 'VTT download failed' };
  }

  // Parse VTT
  const vttContent = fs.readFileSync(vttPath, 'utf-8');
  const vttEntries = parseVTT(vttContent);
  console.log(`  ✅ VTT loaded: ${vttEntries.length} entries`);

  // Chunk the VTT
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

  console.log(`  📦 Split into ${chunks.length} chunks`);

  // Extract moments from each chunk
  const allMoments = [];
  let totalLatency = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkText = chunk.map(e => e.text).join(' ');

    console.log(`  Chunk ${i + 1}/${chunks.length}: ${(chunkText.length / 1000).toFixed(1)}K chars...`);

    const result = await extractMoments(chunkText);

    if (result.error) {
      console.log(`    ❌ Failed: ${result.error}`);
    } else {
      console.log(`    ✅ ${result.moments.length} moments (${(result.latency_ms / 1000).toFixed(1)}s)`);
      allMoments.push(...(result.moments || []));
      totalLatency += result.latency_ms;
    }

    // Rate limiting: wait between chunks to stay under 500K TPM
    // Each chunk is ~51K tokens, so we can do ~9 chunks per minute
    // Wait 7 seconds between chunks to be safe (60s / 8 chunks = 7.5s)
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 7000));
    }
  }

  console.log(`  📊 Total: ${allMoments.length} moments extracted`);

  // Match timestamps
  console.log('  Matching timestamps...');
  for (const moment of allMoments) {
    const match = findTimestampForQuote(moment.quote, vttEntries);
    if (match) {
      moment.timestamp_start = match.start;
      moment.timestamp_end = match.end;
      moment.timestamp_confidence = match.confidence;
    }
  }

  const matched = allMoments.filter(m => m.timestamp_start).length;
  console.log(`  ✅ Matched ${matched}/${allMoments.length} timestamps (${((matched / allMoments.length) * 100).toFixed(1)}%)`);

  // Count Reality Check moments
  const realityChecks = allMoments.filter(m => m.category === 'Reality Check');
  console.log(`  🎯 Reality Check: ${realityChecks.length} moments`);

  // Save results locally
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = `${OUTPUT_DIR}/${date}-gpt-5-mini.json`;

  const results = {
    model: MODEL,
    session_date: date,
    extracted_at: new Date().toISOString(),
    vtt_entries: vttEntries.length,
    chunks: chunks.length,
    moments: allMoments,
    matched_moments: matched,
    match_rate: ((matched / allMoments.length) * 100).toFixed(1),
    reality_check_count: realityChecks.length,
    total_latency_ms: totalLatency
  };

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`  💾 Saved locally: ${outputPath}`);

  // Upload to R2
  console.log('  Uploading to R2...');
  const uploaded = uploadResultToR2(date, outputPath);

  return {
    date,
    status: 'success',
    moments: allMoments.length,
    matched: matched,
    reality_checks: realityChecks.length,
    uploaded_to_r2: uploaded
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('=== GPT-5-MINI MOMENT EXTRACTION - PRODUCTION RUN ===\n');
  console.log(`Model: ${MODEL}`);
  console.log(`Rate limits: ${MAX_REQUESTS_PER_MINUTE} RPM, ${MAX_TOKENS_PER_MINUTE} TPM`);
  console.log(`Max chunks per minute: ${MAX_CHUNKS_PER_MINUTE}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`\nStarted at: ${new Date().toISOString()}\n`);

  // List all transcripts
  const allTranscripts = listAllTranscriptsInR2();

  // Filter out already processed
  const toProcess = allTranscripts.filter(date => !hasExistingMomentExtraction(date));
  const alreadyProcessed = allTranscripts.length - toProcess.length;

  console.log(`\n📊 Processing Status:`);
  console.log(`  Total transcripts: ${allTranscripts.length}`);
  console.log(`  Already processed: ${alreadyProcessed}`);
  console.log(`  To process: ${toProcess.length}`);
  console.log(`  Order: Newest to oldest (${toProcess[0]} → ${toProcess[toProcess.length - 1]})\n`);

  if (toProcess.length === 0) {
    console.log('✅ All transcripts already processed!');
    return;
  }

  // Process each transcript
  const results = [];
  let processed = 0;
  let failed = 0;

  for (const date of toProcess) {
    const result = await processTranscript(date);
    results.push(result);

    if (result.status === 'success') {
      processed++;
    } else {
      failed++;
    }

    console.log(`\n📈 Progress: ${processed + failed}/${toProcess.length} (${processed} success, ${failed} failed)`);

    // Optional: Add delay between transcripts if needed for rate limiting
    // Most transcripts will have multiple chunks with built-in delays
  }

  // Summary
  console.log('\n=== EXTRACTION COMPLETE ===');
  console.log(`Total processed: ${processed}/${toProcess.length}`);
  console.log(`Failed: ${failed}`);
  console.log(`\nResults stored in:`);
  console.log(`  Local: ${OUTPUT_DIR}/`);
  console.log(`  R2: moment-extraction/`);
  console.log(`\nFinished at: ${new Date().toISOString()}`);

  // Save summary
  const summaryPath = `${OUTPUT_DIR}/_extraction_summary.json`;
  fs.writeFileSync(summaryPath, JSON.stringify({
    completed_at: new Date().toISOString(),
    model: MODEL,
    total_transcripts: allTranscripts.length,
    already_processed: alreadyProcessed,
    newly_processed: processed,
    failed: failed,
    results: results
  }, null, 2));
}

main().catch(console.error);
