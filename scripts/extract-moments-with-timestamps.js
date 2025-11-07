#!/usr/bin/env node

/**
 * Enhanced Moment Extraction with Chunking + Precise VTT Timestamp Matching
 *
 * Features:
 * - Intelligent chunking to stay under 400K token limit for full transcript processing
 * - GPT-5-mini vs GPT-5-nano comparison
 * - Fuzzy text matching to find quotes in VTT transcripts
 * - Precise video timestamps (HH:MM:SS - HH:MM:SS format)
 *
 * GPT-5-mini specs:
 * - Context: 400K tokens (input + output combined)
 * - Max output: 128K tokens
 * - Pricing: $0.25 input / $2.00 output per 1M tokens
 * - Reasoning support: Yes
 *
 * GPT-5-nano specs:
 * - Cost-optimized reasoning and chat model
 * - Pricing: TBD
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ENDPOINT_URL = 'https://5b25778cf6d9821373d913f5236e1606.r2.cloudflarestorage.com';
const BUCKET = 'capless-preview';

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
  },
  {
    name: "Reality Check",
    description: "Politicians dismissing concerns, using stats to minimize issues, showing disconnect from public experience, or invalidating people's feelings"
  }
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
 * Estimate token count (rough approximation: ~4 chars per token)
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Chunk transcript to stay under 400K token limit
 * Strategy: Split by speaker turns, but keep chunks contextual
 */
function chunkTranscript(transcript, maxTokensPerChunk = 350000) {
  const chunks = [];
  const takes = transcript.takesSectionVOList || [];

  let currentChunk = {
    metadata: transcript.metadata,
    takesSectionVOList: [],
    chunk_index: 0
  };
  let currentTokens = estimateTokens(JSON.stringify(transcript.metadata || {}));

  for (const take of takes) {
    const takeTokens = estimateTokens(JSON.stringify(take));

    // If adding this take would exceed limit, start new chunk
    if (currentTokens + takeTokens > maxTokensPerChunk && currentChunk.takesSectionVOList.length > 0) {
      chunks.push(currentChunk);
      currentChunk = {
        metadata: transcript.metadata,
        takesSectionVOList: [],
        chunk_index: chunks.length
      };
      currentTokens = estimateTokens(JSON.stringify(transcript.metadata || {}));
    }

    currentChunk.takesSectionVOList.push(take);
    currentTokens += takeTokens;
  }

  // Add final chunk
  if (currentChunk.takesSectionVOList.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Parse VTT file to extract text with timestamps
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

    // Look for timestamp line (format: 00:29:58.159 --> 00:30:07.830)
    if (line.includes('-->')) {
      const [start, end] = line.split('-->').map(t => t.trim().split(' ')[0]);

      // Collect text lines until next timestamp or empty line
      i++;
      let text = '';
      while (i < lines.length && lines[i].trim() && !lines[i].includes('-->')) {
        const textLine = lines[i].trim();
        // Remove word-level timestamp tags (e.g., <00:30:08.559><c> text</c>)
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
 * Find best matching timestamp for a quote in VTT transcript
 * Uses SIMPLIFIED fuzzy matching that prioritizes finding matches
 */
function findTimestampForQuote(quote, vttEntries) {
  // Normalize text for matching (preserve word boundaries)
  const normalizeText = (text) => text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normalizedQuote = normalizeText(quote);
  const quoteWords = normalizedQuote.split(' ').filter(w => w.length > 0);

  let bestMatch = null;
  let bestScore = 0;

  // Try different window sizes (from large to small)
  for (let i = 0; i < vttEntries.length; i++) {
    const maxWindowSize = Math.min(30, vttEntries.length - i); // Increased to 30 entries for longer quotes

    for (let size = maxWindowSize; size >= 1; size--) {
      const windowEntries = vttEntries.slice(i, i + size);
      const windowText = normalizeText(windowEntries.map(e => e.text).join(' '));
      const windowWords = windowText.split(' ').filter(w => w.length > 0);

      // SIMPLIFIED scoring: prioritize finding matches over precision
      let score = 0;

      // 1. Exact substring match = instant match
      if (windowText.includes(normalizedQuote)) {
        score = 1.0;
      }
      // 2. High sequential word matching (most words in order)
      else {
        const sequentialRatio = calculateSequentialMatch(quoteWords, windowWords);
        const overlapRatio = calculateWordOverlap(quoteWords, windowWords);

        // Use the BETTER of sequential or overlap (not weighted average)
        score = Math.max(sequentialRatio * 0.9, overlapRatio * 0.7);
      }

      // Adaptive threshold: shorter quotes need higher confidence
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
 * Calculate sequential word matching score (preserves word order)
 * Returns ratio of longest sequential match to quote length
 */
function calculateSequentialMatch(quoteWords, windowWords) {
  let maxSequentialMatch = 0;

  for (let i = 0; i < windowWords.length; i++) {
    let sequentialCount = 0;
    let quoteIndex = 0;

    for (let j = i; j < windowWords.length && quoteIndex < quoteWords.length; j++) {
      if (windowWords[j] === quoteWords[quoteIndex]) {
        sequentialCount++;
        quoteIndex++;
      } else if (sequentialCount > 0) {
        // Allow small gaps (up to 2 words) in sequence
        const gap = j - (i + sequentialCount);
        if (gap > 2) break;
      }
    }

    maxSequentialMatch = Math.max(maxSequentialMatch, sequentialCount);
  }

  return maxSequentialMatch / quoteWords.length;
}

/**
 * Calculate word overlap score (ignores order)
 */
function calculateWordOverlap(quoteWords, windowWords) {
  const windowSet = new Set(windowWords);
  const matchedWords = quoteWords.filter(word => windowSet.has(word));
  return matchedWords.length / quoteWords.length;
}

/**
 * Calculate longest common substring ratio
 */
function calculateSubstringRatio(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0 || len2 === 0) return 0;

  // Use dynamic programming to find longest common substring
  let maxLen = 0;
  const dp = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        maxLen = Math.max(maxLen, dp[i][j]);
      }
    }
  }

  return maxLen / len1;
}

/**
 * Convert date from DD-MM-YYYY to YYYY-MM-DD format
 */
function convertDateFormat(date) {
  // Check if date is already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  // Convert from DD-MM-YYYY to YYYY-MM-DD
  if (/^\d{2}-\d{2}-\d{4}$/.test(date)) {
    const [day, month, year] = date.split('-');
    return `${year}-${month}-${day}`;
  }

  return date;
}

/**
 * Download VTT transcript from R2
 */
async function downloadVTTTranscript(date) {
  // Convert date format for VTT lookup
  const vttDate = convertDateFormat(date);
  const vttPath = `/tmp/vtt-${vttDate}.vtt`;

  try {
    execSync(
      `aws s3 cp s3://${BUCKET}/youtube/transcripts/${vttDate}.vtt ${vttPath} --endpoint-url ${ENDPOINT_URL}`,
      { stdio: 'pipe' }
    );

    if (fs.existsSync(vttPath)) {
      return fs.readFileSync(vttPath, 'utf-8');
    }
  } catch (error) {
    console.error(`  ⚠️  VTT not found for ${date} (tried ${vttDate}):`, error.message);
  }

  return null;
}

/**
 * Extract moments using GPT-5-mini
 */
async function extractMomentsGPT5Mini(transcriptChunk, chunkInfo) {
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
            content: `${EXTRACTION_PROMPT}\n\nTranscript (chunk ${chunkInfo.index + 1}/${chunkInfo.total}):\n${JSON.stringify(transcriptChunk)}`
          }
        ],
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
      chunk: chunkInfo.index,
      moments: JSON.parse(data.choices[0].message.content).moments || [],
      usage: data.usage,
      cost: calculateCost(data.usage, 'gpt-5-mini'),
      latency_ms: latency
    };
  } catch (error) {
    return {
      model: 'gpt-5-mini',
      chunk: chunkInfo.index,
      error: error.message,
      latency_ms: Date.now() - startTime
    };
  }
}

/**
 * Extract moments using GPT-5-nano
 */
async function extractMomentsGPT5Nano(transcriptChunk, chunkInfo) {
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
            content: `${EXTRACTION_PROMPT}\n\nTranscript (chunk ${chunkInfo.index + 1}/${chunkInfo.total}):\n${JSON.stringify(transcriptChunk)}`
          }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GPT-5-nano API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    // Try to parse JSON from response (may not have structured output)
    let moments = [];
    try {
      const parsed = JSON.parse(data.choices[0].message.content);
      moments = parsed.moments || [];
    } catch {
      // If not valid JSON, skip this chunk
      console.log(`  ⚠️  GPT-5-nano returned non-JSON response for chunk ${chunkInfo.index}`);
    }

    return {
      model: 'gpt-5-nano',
      chunk: chunkInfo.index,
      moments,
      usage: data.usage,
      cost: calculateCost(data.usage, 'gpt-5-nano'),
      latency_ms: latency
    };
  } catch (error) {
    return {
      model: 'gpt-5-nano',
      chunk: chunkInfo.index,
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
  console.log(`Testing on ${transcriptPaths.length} parliament sessions with chunking\n`);

  const results = [];

  for (const transcriptPath of transcriptPaths) {
    console.log(`\nProcessing: ${path.basename(transcriptPath)}`);

    const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8'));
    const date = transcript.metadata?.sittingDate || path.basename(transcriptPath, '.json');

    console.log(`  Session date: ${date}`);

    // Download VTT transcript if available
    console.log(`  Downloading VTT transcript...`);
    const vttContent = await downloadVTTTranscript(date);
    const vttEntries = vttContent ? parseVTT(vttContent) : null;

    if (vttEntries) {
      console.log(`  ✅ VTT transcript loaded: ${vttEntries.length} entries`);
    } else {
      console.log(`  ⚠️  No VTT transcript available for ${date}`);
    }

    // Chunk transcript
    const chunks = chunkTranscript(transcript);
    console.log(`  Transcript chunked into ${chunks.length} parts (max 350K tokens each)`);

    const miniResults = [];
    const nanoResults = [];

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkInfo = { index: i, total: chunks.length };

      console.log(`\n  === CHUNK ${i + 1}/${chunks.length} ===`);
      console.log(`  Testing GPT-5-mini...`);

      const miniResult = await extractMomentsGPT5Mini(chunk, chunkInfo);
      miniResults.push(miniResult);

      if (miniResult.error) {
        console.log(`  ❌ GPT-5-mini failed: ${miniResult.error}`);
      } else {
        console.log(`  ✅ GPT-5-mini extracted ${miniResult.moments.length} moments`);
        console.log(`     Cost: $${miniResult.cost.total_cost.toFixed(6)} (${miniResult.cost.input_tokens} input + ${miniResult.cost.output_tokens} output tokens)`);
        console.log(`     Latency: ${(miniResult.latency_ms / 1000).toFixed(2)}s`);
      }

      console.log(`  Testing GPT-5-nano...`);

      const nanoResult = await extractMomentsGPT5Nano(chunk, chunkInfo);
      nanoResults.push(nanoResult);

      if (nanoResult.error) {
        console.log(`  ❌ GPT-5-nano failed: ${nanoResult.error}`);
      } else {
        console.log(`  ✅ GPT-5-nano extracted ${nanoResult.moments.length} moments`);
        console.log(`     Cost: ${nanoResult.cost.note || `$${nanoResult.cost.total_cost.toFixed(6)}`} (${nanoResult.cost.input_tokens} input + ${nanoResult.cost.output_tokens} output tokens)`);
        console.log(`     Latency: ${(nanoResult.latency_ms / 1000).toFixed(2)}s`);
      }
    }

    // Aggregate moments from all chunks
    const allMiniMoments = miniResults.flatMap(r => r.moments || []);
    const allNanoMoments = nanoResults.flatMap(r => r.moments || []);

    console.log(`\n  === TIMESTAMP MATCHING ===`);

    // Match timestamps for GPT-5-mini moments
    if (vttEntries && allMiniMoments.length > 0) {
      console.log(`  Matching ${allMiniMoments.length} GPT-5-mini moments to VTT timestamps...`);
      for (const moment of allMiniMoments) {
        const match = findTimestampForQuote(moment.quote, vttEntries);
        if (match) {
          moment.timestamp_start = match.start;
          moment.timestamp_end = match.end;
          moment.timestamp_confidence = match.confidence;
          moment.matched_text = match.matchedText;
        } else {
          moment.timestamp_error = 'No matching text found in VTT';
        }
      }
      const matched = allMiniMoments.filter(m => m.timestamp_start).length;
      console.log(`  ✅ Matched ${matched}/${allMiniMoments.length} GPT-5-mini moments (${(matched / allMiniMoments.length * 100).toFixed(1)}%)`);
    }

    // Match timestamps for GPT-5-nano moments
    if (vttEntries && allNanoMoments.length > 0) {
      console.log(`  Matching ${allNanoMoments.length} GPT-5-nano moments to VTT timestamps...`);
      for (const moment of allNanoMoments) {
        const match = findTimestampForQuote(moment.quote, vttEntries);
        if (match) {
          moment.timestamp_start = match.start;
          moment.timestamp_end = match.end;
          moment.timestamp_confidence = match.confidence;
          moment.matched_text = match.matchedText;
        } else {
          moment.timestamp_error = 'No matching text found in VTT';
        }
      }
      const matched = allNanoMoments.filter(m => m.timestamp_start).length;
      console.log(`  ✅ Matched ${matched}/${allNanoMoments.length} GPT-5-nano moments (${(matched / allNanoMoments.length * 100).toFixed(1)}%)`);
    }

    results.push({
      session: date,
      metadata: transcript.metadata,
      chunks: chunks.length,
      gpt5_mini: {
        chunk_results: miniResults,
        total_moments: allMiniMoments.length,
        moments_with_timestamps: allMiniMoments.filter(m => m.timestamp_start).length,
        moments: allMiniMoments,
        total_cost: miniResults.reduce((sum, r) => sum + (r.cost?.total_cost || 0), 0),
        avg_latency_ms: miniResults.reduce((sum, r) => sum + r.latency_ms, 0) / miniResults.length
      },
      gpt5_nano: {
        chunk_results: nanoResults,
        total_moments: allNanoMoments.length,
        moments_with_timestamps: allNanoMoments.filter(m => m.timestamp_start).length,
        moments: allNanoMoments,
        total_cost: nanoResults.reduce((sum, r) => sum + (r.cost?.total_cost || 0), 0),
        avg_latency_ms: nanoResults.reduce((sum, r) => sum + r.latency_ms, 0) / nanoResults.length
      }
    });

    // Save individual results
    const outputPath = `/Users/erniesg/code/erniesg/capless/test-outputs/moment-extraction/${date}-comparison-with-timestamps.json`;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(results[results.length - 1], null, 2));
    console.log(`  💾 Saved to: ${outputPath}`);
  }

  // Generate summary report
  console.log('\n\n=== COMPARISON SUMMARY ===\n');

  const summary = {
    total_sessions: results.length,
    gpt5_mini: {
      successful: results.filter(r => r.gpt5_mini.total_moments > 0).length,
      total_moments: results.reduce((sum, r) => sum + r.gpt5_mini.total_moments, 0),
      moments_with_timestamps: results.reduce((sum, r) => sum + r.gpt5_mini.moments_with_timestamps, 0),
      total_cost: results.reduce((sum, r) => sum + r.gpt5_mini.total_cost, 0),
      avg_moments_per_session: results.reduce((sum, r) => sum + r.gpt5_mini.total_moments, 0) / results.length,
      avg_latency_s: results.reduce((sum, r) => sum + r.gpt5_mini.avg_latency_ms, 0) / results.length / 1000,
      timestamp_match_rate: results.reduce((sum, r) => sum + (r.gpt5_mini.moments_with_timestamps / Math.max(r.gpt5_mini.total_moments, 1)), 0) / results.length
    },
    gpt5_nano: {
      successful: results.filter(r => r.gpt5_nano.total_moments > 0).length,
      total_moments: results.reduce((sum, r) => sum + r.gpt5_nano.total_moments, 0),
      moments_with_timestamps: results.reduce((sum, r) => sum + r.gpt5_nano.moments_with_timestamps, 0),
      total_cost: results.reduce((sum, r) => sum + r.gpt5_nano.total_cost, 0),
      avg_moments_per_session: results.reduce((sum, r) => sum + r.gpt5_nano.total_moments, 0) / results.length,
      avg_latency_s: results.reduce((sum, r) => sum + r.gpt5_nano.avg_latency_ms, 0) / results.length / 1000,
      timestamp_match_rate: results.reduce((sum, r) => sum + (r.gpt5_nano.moments_with_timestamps / Math.max(r.gpt5_nano.total_moments, 1)), 0) / results.length
    },
    results: results
  };

  console.log('GPT-5-mini:');
  console.log(`  Success: ${summary.gpt5_mini.successful}/${results.length}`);
  console.log(`  Total moments extracted: ${summary.gpt5_mini.total_moments}`);
  console.log(`  Moments with timestamps: ${summary.gpt5_mini.moments_with_timestamps} (${(summary.gpt5_mini.timestamp_match_rate * 100).toFixed(1)}%)`);
  console.log(`  Total cost: $${summary.gpt5_mini.total_cost.toFixed(4)}`);
  console.log(`  Avg moments per session: ${summary.gpt5_mini.avg_moments_per_session.toFixed(1)}`);
  console.log(`  Avg latency: ${summary.gpt5_mini.avg_latency_s.toFixed(2)}s per chunk`);

  console.log('\nGPT-5-nano:');
  console.log(`  Success: ${summary.gpt5_nano.successful}/${results.length}`);
  console.log(`  Total moments extracted: ${summary.gpt5_nano.total_moments}`);
  console.log(`  Moments with timestamps: ${summary.gpt5_nano.moments_with_timestamps} (${(summary.gpt5_nano.timestamp_match_rate * 100).toFixed(1)}%)`);
  console.log(`  Total cost: ${summary.gpt5_nano.total_cost > 0 ? `$${summary.gpt5_nano.total_cost.toFixed(4)}` : 'TBD'}`);
  console.log(`  Avg moments per session: ${summary.gpt5_nano.avg_moments_per_session.toFixed(1)}`);
  console.log(`  Avg latency: ${summary.gpt5_nano.avg_latency_s.toFixed(2)}s per chunk`);

  // Save summary
  const summaryPath = '/Users/erniesg/code/erniesg/capless/test-outputs/moment-extraction/comparison-summary-with-timestamps.json';
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\n💾 Summary saved to: ${summaryPath}`);

  return summary;
}

// Test VTT file directly (with chunking for large files)
async function testDirectVTT(vttPath) {
  console.log('=== TESTING DIRECT VTT FILE ===\n');
  console.log(`VTT file: ${vttPath}\n`);

  // Load and parse VTT
  const vttContent = fs.readFileSync(vttPath, 'utf-8');
  const vttEntries = parseVTT(vttContent);

  console.log(`✅ VTT loaded: ${vttEntries.length} entries`);

  // Extract date from filename
  const dateMatch = path.basename(vttPath).match(/(\d{4}-\d{2}-\d{2})/);
  const sessionDate = dateMatch ? dateMatch[1] : 'unknown';

  // Chunk the VTT entries to stay under 50K tokens per request
  const maxCharsPerChunk = 200000; // ~50K tokens (4 chars per token)
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

  // Extract moments from each chunk with GPT-5-nano only (due to rate limits)
  console.log('=== EXTRACTING MOMENTS ===\n');
  const allNanoMoments = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkText = chunk.map(e => e.text).join(' ');

    console.log(`\n  === CHUNK ${i + 1}/${chunks.length} ===`);
    console.log(`  Size: ${(chunkText.length / 1000).toFixed(1)}K chars (~${(chunkText.length / 4000).toFixed(1)}K tokens)`);

    const mockTranscript = {
      metadata: { sittingDate: sessionDate, source: 'youtube_vtt', chunk: i + 1 },
      takesSectionVOList: [{ content: chunkText }]
    };

    const nanoResult = await extractMomentsGPT5Nano(mockTranscript, { index: i, total: chunks.length });

    if (nanoResult.error) {
      console.log(`  ❌ Failed: ${nanoResult.error}`);
    } else {
      console.log(`  ✅ Extracted ${nanoResult.moments.length} moments`);
      console.log(`  Cost: ${nanoResult.cost.note || `$${nanoResult.cost.total_cost.toFixed(6)}`}`);
      console.log(`  Latency: ${(nanoResult.latency_ms / 1000).toFixed(2)}s`);
      allNanoMoments.push(...(nanoResult.moments || []));
    }
  }

  console.log(`\n📊 Total moments extracted: ${allNanoMoments.length}`);

  // Match timestamps
  console.log('\n=== TIMESTAMP MATCHING ===\n');

  for (const moment of allNanoMoments) {
    const match = findTimestampForQuote(moment.quote, vttEntries);
    if (match) {
      moment.timestamp_start = match.start;
      moment.timestamp_end = match.end;
      moment.timestamp_confidence = match.confidence;
      moment.matched_text = match.matchedText;
      console.log(`✅ "${moment.title}" → ${match.start}`);
    } else {
      moment.timestamp_error = 'No matching text found in VTT';
      console.log(`❌ "${moment.title}" - NO MATCH`);
    }
  }

  // Summary
  const matched = allNanoMoments.filter(m => m.timestamp_start).length;
  console.log(`\n📊 Match rate: ${matched}/${allNanoMoments.length} (${((matched / allNanoMoments.length) * 100).toFixed(1)}%)`);

  // Save results
  const outputPath = `/Users/erniesg/code/erniesg/capless/test-outputs/moment-extraction/${sessionDate}-vtt-test.json`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const results = {
    session_date: sessionDate,
    vtt_file: vttPath,
    vtt_entries: vttEntries.length,
    chunks: chunks.length,
    moments: allNanoMoments,
    matched_moments: matched,
    match_rate: ((matched / allNanoMoments.length) * 100).toFixed(1)
  };

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${outputPath}`);

  return results;
}

// Main execution
async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable not set');
    process.exit(1);
  }

  // Check if VTT file path provided as argument
  const vttPath = process.argv[2];

  if (vttPath && vttPath.endsWith('.vtt')) {
    // Direct VTT test mode
    if (!fs.existsSync(vttPath)) {
      console.error(`❌ VTT file not found: ${vttPath}`);
      process.exit(1);
    }
    await testDirectVTT(vttPath);
    return;
  }

  // Original mode: Test on 3 sample sessions from different eras
  const testSessions = [
    '/tmp/transcript-samples/2025.json',     // 2020s - new format
    '/tmp/transcript-samples/2008.json',     // 2000s - old format
    '/tmp/transcript-samples/1984.json'      // 1980s - old format
  ];

  // Filter to existing files
  const existingSessions = testSessions.filter(filePath => {
    try {
      fs.accessSync(filePath);
      return true;
    } catch {
      console.log(`⚠️  Skipping ${filePath} (not found)`);
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
