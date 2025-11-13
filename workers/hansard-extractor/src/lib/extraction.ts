/**
 * Common functions for moment extraction from parliamentary transcripts
 * Pure TypeScript implementation for Cloudflare Workers
 */

export interface Highlight {
  quote: string;
  speaker: string;
}

export interface Moment {
  summary: string;
  highlights: Highlight[];
  speakers: string[];
  why_viral: string;
  viral_score: number;
  title: string;
  source_chunk_id?: string;
  source_sections?: number[];
  source_section_titles?: string[];
  chunk_metadata?: ChunkMetadata;
  initial_score?: number;
  final_score?: number;
  ranking_reason?: string;
  global_ranking?: number;
}

export interface ChunkMetadata {
  chunk_id: string;
  sections: number[];
  section_titles: string[];
  section_types: string[];
  type: 'combined' | 'large';
  char_count: number;
}

export interface ConsolidationStats {
  total_candidates_extracted: number;
  semantic_duplicates_removed: number;
  final_moments_count: number;
  avg_initial_score: number;
  avg_final_score: number;
  top_moment_score: number;
}

export interface DeduplicationDecision {
  kept_index: number;
  kept_quote: string;
  removed_index: number;
  removed_quote: string;
  similarity: number;
  reason: string;
}

/**
 * Strip HTML tags from text
 */
export function stripHtml(html: string): string {
  const clean = html
    .replace(/<[^<]+?>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean;
}

/**
 * Extract viral moments from a transcript chunk with retry logic
 */
export async function extractMomentsWithRetry(
  chunkText: string,
  chunkMetadata: ChunkMetadata,
  apiKey: string,
  model: string = 'gpt-5-mini',
  maxRetries: number = 3
): Promise<Moment[] | null> {
  const prompt = `You are "The Digger" - an expert political journalist analyzing Singapore Parliamentary transcripts for notable moments.

MISSION: Find 15-20 moments that reveal how politics actually works. Not just viral-bait, but genuinely revealing exchanges.

Cast a WIDE net - include both obvious soundbites AND subtler moments of evasion, contradiction, or tough questioning.

AUDIENCE: Smart, cynical citizens who can spot "wayang" and appreciate both problems AND solutions.

═══════════════════════════════════════════════════════════
WHAT MAKES A MOMENT NOTABLE:
═══════════════════════════════════════════════════════════

1. NUMBERS THAT DON'T MATCH THE REACTION (works BOTH ways)
   A. Officials DISMISSING worsening conditions people actually feel:
      - Minimizing increases as negligible when each incident affects thousands
      - Questioning why public is concerned about deteriorating metrics
      - Using small percentage differences to dismiss real recurring problems
      - Treating worse performance as if it's unchanged

   B. Overreacting to minor changes:
      - Treating tiny differences as major shifts to justify policies
      - Alarm level doesn't match the actual magnitude

2. EVASION / "SIAM"
   Asked a direct question, gives an indirect answer
   - Reframing the question to answer something else
   - Complexity used to obscure simple issues
   - "We don't track that" when they clearly should

3. TOUGH QUESTIONING
   MPs doing their job: challenging power with evidence
   - Pointing out math that doesn't add up
   - Demanding plain language for jargon
   - Following up when answers dodge the question

4. JARGON OVERLOAD
   Bureaucratic complexity obscuring simple reality
   Government-speak that needs translation for normal humans

5. SOFTBALL SETUP
   Friendly questions designed to let Ministers give prepared speeches
   The opposite of tough questioning - political theater

6. ACCOUNTABILITY MOMENT
   Someone taking real responsibility (rare and notable)
   - Clear commitments with timelines
   - Admitting mistakes transparently
   - Breaking ranks to speak truth

7. REVEALING DATA
   Statistics that expose underlying reality
   Numbers that tell a different story than the rhetoric

8. HUMAN MOMENT
   Genuine emotion, humor, or connection
   - Unscripted reactions
   - Moments of real empathy across divides
   - Unexpected humanity

9. WILDCARD
   Doesn't fit categories but undeniably notable
   - Bizarre timing
   - Surreal exchanges
   - Unprecedented situations
   - "Wait, did that just happen?" moments

═══════════════════════════════════════════════════════════
CRITICAL GUIDELINES:
═══════════════════════════════════════════════════════════

BALANCE: Find both problems (evasion, jargon) AND solutions (tough questions, accountability)

SPECIFICITY: Prefer concrete exchanges over vague speeches

COMPLETENESS: Include BOTH the question AND the answer - context matters

DIVERSITY: Don't extract 5 versions of the same pattern

═══════════════════════════════════════════════════════════
OUTPUT:
═══════════════════════════════════════════════════════════

{
  "moments": [
    {
      "summary": "What's happening (plain language, like explaining to a friend)",
      "highlights": [
        {"quote": "The exact shareable clip (15-40 words)", "speaker": "Who said it"}
      ],
      "speakers": ["All participants"],
      "why_viral": "Why this blows up - what will comments/duets say? Use internet language.",
      "viral_score": 7.0-10.0,
      "title": "Punchy TikTok-style headline (5-10 words)"
    }
  ]
}

Transcript:
${chunkText}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert content curator for viral political moments. Return only valid JSON, no markdown.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: { type: 'json_object' }
        })
      });

      if (response.status === 429) {
        if (attempt < maxRetries - 1) {
          const waitTime = (2 ** attempt) + Math.random();
          console.error(`⏳ Rate limited. Retry in ${waitTime.toFixed(1)}s...`);
          await sleep(waitTime * 1000);
          continue;
        } else {
          console.error('❌ Rate limit exceeded');
          return null;
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ OpenAI API error: ${response.status} ${errorText.slice(0, 200)}`);
        return null;
      }

      const result = await response.json() as any;
      const momentsData = JSON.parse(result.choices[0].message.content);
      const moments: Moment[] = momentsData.moments || [];

      // Add chunk metadata to each moment
      for (const moment of moments) {
        moment.source_chunk_id = chunkMetadata.chunk_id;
        moment.source_sections = chunkMetadata.sections;
        moment.source_section_titles = chunkMetadata.section_titles;
        moment.chunk_metadata = chunkMetadata;
      }

      return moments;

    } catch (error) {
      if (attempt < maxRetries - 1) {
        const waitTime = (2 ** attempt) + Math.random();
        console.error(`⏳ Error: ${error}. Retry in ${waitTime.toFixed(1)}s...`);
        await sleep(waitTime * 1000);
      } else {
        console.error(`❌ Final attempt failed: ${error}`);
        return null;
      }
    }
  }

  return null;
}

/**
 * Generate embeddings using OpenAI
 */
export async function generateEmbeddings(
  texts: string[],
  apiKey: string,
  maxRetries: number = 3
): Promise<number[][] | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: texts
        })
      });

      if (response.status === 429) {
        if (attempt < maxRetries - 1) {
          const waitTime = (2 ** attempt) + Math.random();
          console.error(`  ⏳ Embedding rate limited. Retry ${attempt + 1}/${maxRetries} in ${waitTime.toFixed(1)}s...`);
          await sleep(waitTime * 1000);
          continue;
        } else {
          console.error('  ❌ Embedding rate limit exceeded');
          return null;
        }
      }

      if (!response.ok) {
        console.error(`  ❌ Embedding API error: ${response.status}`);
        return null;
      }

      const result = await response.json() as any;
      return result.data.map((item: any) => item.embedding);

    } catch (error) {
      if (attempt < maxRetries - 1) {
        const waitTime = (2 ** attempt) + Math.random();
        console.error(`  ⏳ Embedding error: ${error}. Retry ${attempt + 1}/${maxRetries} in ${waitTime.toFixed(1)}s...`);
        await sleep(waitTime * 1000);
      } else {
        console.error(`  ❌ Embedding failed: ${error}`);
        return null;
      }
    }
  }

  return null;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return (normA * normB) > 0 ? dotProduct / (normA * normB) : 0;
}

/**
 * Remove semantically similar moments using embeddings
 */
export async function semanticDeduplication(
  moments: Moment[],
  apiKey: string,
  threshold: number = 0.85
): Promise<{ unique: Moment[], decisions: DeduplicationDecision[] }> {
  if (moments.length === 0) {
    return { unique: [], decisions: [] };
  }

  console.error(`  🧠 Generating embeddings for ${moments.length} moments...`);

  // Generate embeddings for all summaries (to detect duplicate exchanges)
  const summaries = moments.map(m => m.summary);
  const embeddings = await generateEmbeddings(summaries, apiKey);

  if (!embeddings) {
    console.error('  ⚠️ Embedding generation failed, skipping semantic deduplication');
    return { unique: moments, decisions: [] };
  }

  // Find duplicates using similarity matrix
  const uniqueMoments: Moment[] = [];
  const removedIndices = new Set<number>();
  const dedupDecisions: DeduplicationDecision[] = [];

  for (let i = 0; i < moments.length; i++) {
    if (removedIndices.has(i)) {
      continue;
    }

    uniqueMoments.push(moments[i]);

    // Find similar moments
    for (let j = i + 1; j < moments.length; j++) {
      if (removedIndices.has(j)) {
        continue;
      }

      const similarity = cosineSimilarity(embeddings[i], embeddings[j]);

      if (similarity > threshold) {
        removedIndices.add(j);

        dedupDecisions.push({
          kept_index: i,
          kept_quote: moments[i].summary.slice(0, 100),
          removed_index: j,
          removed_quote: moments[j].summary.slice(0, 100),
          similarity,
          reason: 'semantic_similarity'
        });
      }
    }
  }

  console.error(`  ✅ Semantic dedup: ${moments.length} → ${uniqueMoments.length} moments (${removedIndices.size} removed)`);

  return { unique: uniqueMoments, decisions: dedupDecisions };
}

/**
 * Send all candidate moments to AI for global reranking
 */
export async function globalReranking(
  moments: Moment[],
  apiKey: string,
  maxRetries: number = 3
): Promise<Moment[]> {
  if (moments.length === 0) {
    return [];
  }

  console.error(`  🎯 Global reranking of ${moments.length} candidates...`);

  // Prepare moment summaries for AI
  const momentSummaries = moments.map((m, i) => {
    const speakers = m.speakers.join(', ');
    const firstHighlight = m.highlights[0]?.quote.slice(0, 80) || m.summary.slice(0, 80);
    return `${i + 1}. [${m.viral_score || 7.0}] ${speakers}: "${firstHighlight}..."`;
  });

  const prompt = `You are reviewing ALL candidate moments extracted from a parliamentary session.

Here are ${moments.length} candidate moments that were extracted:

${momentSummaries.join('\n')}

Your task:
1. Consider each moment's virality potential in the context of the FULL session
2. Re-score each moment if needed (some may be less unique when seeing all moments together)
3. Return ALL moments ranked by final priority (highest to lowest)

Prioritize:
- Unique perspectives (avoid multiple variations of the same point)
- Diversity of topics and speakers
- Mix of problematic and wholesome moments
- Truly standout content that will get shared

Return a JSON object with:
{
  "ranked_moments": [
    {
      "original_index": 0,
      "final_score": 8.5,
      "ranking_reason": "Brief explanation of ranking"
    }
  ]
}

Return all ${moments.length} moments in ranked order.`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-5-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert content strategist. Return only valid JSON, no markdown.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: { type: 'json_object' }
        })
      });

      if (response.status === 429) {
        if (attempt < maxRetries - 1) {
          const waitTime = (2 ** attempt) + Math.random();
          await sleep(waitTime * 1000);
          continue;
        } else {
          console.error('  ⚠️ Reranking rate limited, using original scores');
          return moments.sort((a, b) => (b.viral_score || 7.0) - (a.viral_score || 7.0));
        }
      }

      if (!response.ok) {
        console.error('  ⚠️ Reranking API error, using original scores');
        return moments.sort((a, b) => (b.viral_score || 7.0) - (a.viral_score || 7.0));
      }

      const result = await response.json() as any;
      const rankingData = JSON.parse(result.choices[0].message.content);
      const ranked = rankingData.ranked_moments || [];

      // Deduplicate by original_index (AI sometimes hallucinates duplicates)
      const seenIndices = new Set<number>();
      const uniqueRanked = [];
      let duplicatesFound = 0;

      for (const rankInfo of ranked) {
        const idx = rankInfo.original_index;
        if (!seenIndices.has(idx)) {
          seenIndices.add(idx);
          uniqueRanked.push(rankInfo);
        } else {
          duplicatesFound++;
        }
      }

      if (duplicatesFound > 0) {
        console.error(`  ⚠️  Removed ${duplicatesFound} duplicate rankings from AI response`);
      }

      // Apply new scores and reorder
      const rerankedMoments: Moment[] = [];
      for (const rankInfo of uniqueRanked) {
        const idx = rankInfo.original_index;
        if (idx >= 0 && idx < moments.length) {
          const moment = { ...moments[idx] };
          moment.initial_score = moment.viral_score || 7.0;
          moment.final_score = rankInfo.final_score || moment.initial_score;
          moment.ranking_reason = rankInfo.ranking_reason || '';
          moment.global_ranking = rerankedMoments.length + 1;
          rerankedMoments.push(moment);
        }
      }

      console.error(`  ✅ Global reranking complete: ${moments.length} → ${rerankedMoments.length} moments`);
      return rerankedMoments;

    } catch (error) {
      if (attempt < maxRetries - 1) {
        const waitTime = (2 ** attempt) + Math.random();
        await sleep(waitTime * 1000);
      } else {
        console.error(`  ⚠️ Reranking failed: ${error}, using original scores`);
        return moments.sort((a, b) => (b.viral_score || 7.0) - (a.viral_score || 7.0));
      }
    }
  }

  return moments;
}

/**
 * Sleep helper function
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
