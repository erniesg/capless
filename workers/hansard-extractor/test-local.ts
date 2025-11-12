/**
 * Local test script for TypeScript extraction
 * Run with: npx tsx test-local.ts
 */

import { fetchHansard, chunkBySections } from './src/lib/chunking';
import {
  extractMomentsWithRetry,
  semanticDeduplication,
  globalReranking,
  type Moment,
  type ConsolidationStats,
} from './src/lib/extraction';
import { readFileSync } from 'fs';
import { writeFileSync } from 'fs';

async function testExtraction(date: string) {
  console.error(`\n${'='.repeat(60)}`);
  console.error(`HANSARD MOMENT EXTRACTION TEST (TypeScript)`);
  console.error(`Date: ${date}`);
  console.error(`${'='.repeat(60)}\n`);

  // Load API key from .dev.vars (capless root)
  const devVarsPath = process.env.DEV_VARS_PATH || '/Users/erniesg/code/erniesg/capless/.dev.vars';
  const devVars = readFileSync(devVarsPath, 'utf-8');
  const apiKeyMatch = devVars.match(/OPENAI_API_KEY=(.+)/);
  if (!apiKeyMatch) {
    console.error('❌ OPENAI_API_KEY not found in .dev.vars');
    process.exit(1);
  }
  const apiKey = apiKeyMatch[1].trim();

  // Fetch Hansard data
  const hansardData = await fetchHansard(date);
  if (!hansardData) {
    console.error('❌ Failed to fetch Hansard');
    process.exit(1);
  }

  // Calculate total length
  const sections = hansardData.takesSectionVOList || [];
  const totalChars = sections.reduce((sum, s) => {
    const text = (s.content || '').replace(/<[^<]+?>/g, '').replace(/\s+/g, ' ').trim();
    return sum + text.length;
  }, 0);

  console.error(`📊 Total content: ${totalChars.toLocaleString()} chars across ${sections.length} sections\n`);

  // Chunk by sections
  const chunks = chunkBySections(hansardData);
  console.error(`📦 Created ${chunks.length} chunks (section-aware)`);

  for (const chunk of chunks) {
    const sectionsStr = chunk.metadata.sections.join(', ');
    const titlePreview = chunk.metadata.section_titles[0] || 'N/A';
    console.error(`  • ${chunk.metadata.chunk_id}: sections ${sectionsStr} | ${titlePreview}... | ${chunk.metadata.char_count.toLocaleString()} chars`);
  }
  console.error('');

  // Stage 1: Extract moments from each chunk
  const allMoments: Moment[] = [];
  const rawMomentsByChunk: any[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.error(`🔄 Processing chunk ${i + 1}/${chunks.length} (${chunk.text.length.toLocaleString()} chars)...`);

    const moments = await extractMomentsWithRetry(
      chunk.text,
      chunk.metadata,
      apiKey
    );

    if (moments && moments.length > 0) {
      rawMomentsByChunk.push({
        chunk_id: chunk.metadata.chunk_id,
        moments_count: moments.length,
        moments
      });

      allMoments.push(...moments);
      console.error(`  ✅ Extracted ${moments.length} moments`);
    } else {
      console.error(`  ⚠️  No moments extracted`);
    }

    // Rate limiting between chunks
    if (i < chunks.length - 1) {
      console.error(`  ⏳ Waiting 2s before next chunk...`);
      await sleep(2000);
    }

    console.error('');
  }

  if (allMoments.length === 0) {
    console.error('❌ No moments extracted from any chunk');
    process.exit(1);
  }

  console.error(`✅ Stage 1 complete: ${allMoments.length} candidate moments from ${chunks.length} chunks\n`);

  // Stage 2: Consolidation
  console.error(`${'='.repeat(60)}`);
  console.error('📊 STAGE 2: CONSOLIDATION');
  console.error(`${'='.repeat(60)}`);

  // Semantic deduplication
  const { unique: semanticallyUnique, decisions: dedupDecisions } =
    await semanticDeduplication(allMoments, apiKey, 0.85);

  // Global reranking
  const finalMoments = await globalReranking(semanticallyUnique, apiKey);

  // Consolidation stats
  const consolidationStats: ConsolidationStats = {
    total_candidates_extracted: allMoments.length,
    semantic_duplicates_removed: allMoments.length - semanticallyUnique.length,
    final_moments_count: finalMoments.length,
    avg_initial_score: allMoments.length > 0
      ? allMoments.reduce((sum, m) => sum + (m.viral_score || 7.0), 0) / allMoments.length
      : 0,
    avg_final_score: finalMoments.length > 0
      ? finalMoments.reduce((sum, m) => sum + (m.final_score || m.viral_score || 7.0), 0) / finalMoments.length
      : 0,
    top_moment_score: finalMoments.length > 0
      ? (finalMoments[0].final_score || finalMoments[0].viral_score || 0)
      : 0
  };

  console.error('');
  console.error('✅ Consolidation complete:');
  console.error(`   • ${allMoments.length} candidates → ${semanticallyUnique.length} unique → ${finalMoments.length} ranked`);
  console.error(`   • Removed ${allMoments.length - semanticallyUnique.length} semantic duplicates`);
  console.error(`   • Avg score: ${consolidationStats.avg_initial_score.toFixed(2)} → ${consolidationStats.avg_final_score.toFixed(2)}`);
  console.error('');

  // Prepare output
  const result = {
    date,
    model: 'gpt-5-mini',
    extracted_at: new Date().toISOString(),
    format: 'NEW_STRUCTURED_FORMAT_V2_WITH_CONSOLIDATION_TS',
    extraction_strategy: 'section_aware_chunked_v2_with_consolidation_typescript',
    chunks_processed: chunks.length,
    chunks_metadata: chunks.map(c => c.metadata),
    raw_moments_by_chunk: rawMomentsByChunk,
    consolidation_stats: consolidationStats,
    deduplication_decisions: dedupDecisions.slice(0, 50),
    moments: finalMoments
  };

  // Save to file
  const outputPath = `/tmp/hansard-moments-${date}-typescript.json`;
  writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.error(`${'='.repeat(60)}`);
  console.error('FINAL RESULTS');
  console.error(`${'='.repeat(60)}`);
  console.error(`✅ Final moments: ${finalMoments.length} (from ${allMoments.length} candidates)`);
  console.error(`💾 Saved to ${outputPath}`);
  console.error('');

  // Print TOP 10 moments with ranking
  console.error('TOP 10 MOMENTS (ranked by final score):');
  for (let i = 0; i < Math.min(10, finalMoments.length); i++) {
    const moment = finalMoments[i];
    const initialScore = moment.initial_score || moment.viral_score || 0;
    const finalScore = moment.final_score || initialScore;
    const scoreChange = moment.final_score ? `(${initialScore.toFixed(1)}→${finalScore.toFixed(1)})` : '';

    console.error(`\n${i + 1}. [#${moment.global_ranking || i + 1}] ${moment.title || 'N/A'} ${scoreChange}`);
    console.error(`   Speakers: ${moment.speakers.join(', ')}`);
    console.error(`   Summary: ${moment.summary.slice(0, 150)}...`);
    console.error(`   Highlights:`);
    for (const highlight of moment.highlights) {
      console.error(`      • ${highlight.speaker}: "${highlight.quote.slice(0, 80)}..."`);
    }
    if (moment.ranking_reason) {
      console.error(`   Why ranked here: ${moment.ranking_reason.slice(0, 80)}...`);
    }
  }

  console.error(`\n${'='.repeat(60)}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run test with a random 2025 date (let's try August 6, 2024 - the one we tested before)
const testDate = process.argv[2] || '2024-08-06';
testExtraction(testDate).catch(error => {
  console.error(`\n❌ Error: ${error}`);
  process.exit(1);
});
