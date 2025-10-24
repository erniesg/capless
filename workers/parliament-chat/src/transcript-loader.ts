/**
 * Transcript Loader Service
 *
 * Loads parliamentary session transcripts from R2 storage
 * and parses the Hansard JSON structure
 */

import type { HansardSession } from './types';

/**
 * Parsed transcript segment with speaker and text
 */
export interface TranscriptSegment {
  speaker?: string;
  text: string;
  section_title?: string;
  subsection_title?: string;
}

/**
 * Load Hansard session from R2
 */
export async function loadSessionFromR2(
  r2: R2Bucket,
  sessionDate: string
): Promise<HansardSession | null> {
  const key = `hansard/raw/${sessionDate}.json`;

  console.log(`[TranscriptLoader] Loading session: ${key}`);

  const object = await r2.get(key);

  if (!object) {
    console.log(`[TranscriptLoader] Session not found: ${sessionDate}`);
    return null;
  }

  const json = await object.json() as HansardSession;
  console.log(`[TranscriptLoader] Loaded session: ${sessionDate}`);

  return json;
}

/**
 * Parse Hansard session into transcript segments
 *
 * Extracts text from the nested Hansard structure:
 * - takesSectionVOList[] contains sections
 * - Each section has title, content, and subsections[]
 * - Speaker names are extracted from content patterns
 */
export function parseTranscript(hansard: HansardSession): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  if (!hansard.takesSectionVOList || hansard.takesSectionVOList.length === 0) {
    console.warn('[TranscriptLoader] No takesSectionVOList found in Hansard');
    return segments;
  }

  for (const section of hansard.takesSectionVOList) {
    const sectionTitle = section.title || 'Untitled Section';

    // Add section content if exists
    if (section.content && section.content.trim().length > 0) {
      const sectionSegments = extractSegmentsFromContent(
        section.content,
        sectionTitle
      );
      segments.push(...sectionSegments);
    }

    // Process subsections
    if (section.subsections && section.subsections.length > 0) {
      for (const subsection of section.subsections) {
        const subsectionTitle = subsection.title || 'Untitled Subsection';

        if (subsection.content && subsection.content.trim().length > 0) {
          const subsectionSegments = extractSegmentsFromContent(
            subsection.content,
            sectionTitle,
            subsectionTitle
          );
          segments.push(...subsectionSegments);
        }
      }
    }
  }

  console.log(`[TranscriptLoader] Parsed ${segments.length} transcript segments`);
  return segments;
}

/**
 * Extract segments from content HTML
 *
 * Hansard content contains HTML with speaker tags and paragraphs
 * Format: <p><strong>Speaker Name:</strong> Speech text...</p>
 */
function extractSegmentsFromContent(
  content: string,
  sectionTitle: string,
  subsectionTitle?: string
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  // Remove HTML tags but preserve structure for speaker detection
  // Pattern handles both formats:
  // 1. <p><strong>Name:</strong> Text</p> (old format - colon inside strong)
  // 2. <p><strong>Name</strong>: Text</p> (new format - colon outside strong)
  const speakerPattern = /<p[^>]*><strong>([^<:]+?)(?::)?<\/strong>(?::)?\s*([^<]+?)(?:<\/p>|$)/gi;

  let match;
  while ((match = speakerPattern.exec(content)) !== null) {
    const speaker = match[1]?.trim();
    const text = match[2]?.trim();

    if (text && text.length > 20) { // Filter out very short segments
      segments.push({
        speaker: speaker || undefined,
        text: cleanText(text),
        section_title: sectionTitle,
        subsection_title: subsectionTitle,
      });
    }
  }

  // Fallback: if no speaker patterns found, extract all text
  if (segments.length === 0) {
    const plainText = content
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (plainText.length > 50) {
      segments.push({
        text: cleanText(plainText),
        section_title: sectionTitle,
        subsection_title: subsectionTitle,
      });
    }
  }

  return segments;
}

/**
 * Clean extracted text
 */
function cleanText(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 characters)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Chunk transcript segments into smaller pieces for embedding
 *
 * Splits segments to fit within token limits while preserving context
 */
export function chunkTranscript(
  segments: TranscriptSegment[],
  maxTokens: number = 500,
  overlapTokens: number = 50
): Array<TranscriptSegment & { chunk_index: number }> {
  const chunks: Array<TranscriptSegment & { chunk_index: number }> = [];
  let currentChunk = '';
  let currentSpeaker: string | undefined;
  let currentSection: string | undefined;
  let currentSubsection: string | undefined;
  let chunkIndex = 0;

  for (const segment of segments) {
    const segmentText = segment.speaker
      ? `${segment.speaker}: ${segment.text}`
      : segment.text;

    const segmentTokens = estimateTokens(segmentText);
    const currentTokens = estimateTokens(currentChunk);

    // If adding this segment exceeds max tokens, save current chunk
    if (currentTokens + segmentTokens > maxTokens && currentChunk.length > 0) {
      chunks.push({
        speaker: currentSpeaker,
        text: currentChunk.trim(),
        section_title: currentSection,
        subsection_title: currentSubsection,
        chunk_index: chunkIndex++,
      });

      // Start new chunk with overlap (last N tokens of previous chunk)
      const overlapText = getLastNTokens(currentChunk, overlapTokens);
      currentChunk = overlapText + ' ';
    }

    // Add segment to current chunk
    currentChunk += segmentText + ' ';
    currentSpeaker = segment.speaker || currentSpeaker;
    currentSection = segment.section_title || currentSection;
    currentSubsection = segment.subsection_title || currentSubsection;
  }

  // Add final chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      speaker: currentSpeaker,
      text: currentChunk.trim(),
      section_title: currentSection,
      subsection_title: currentSubsection,
      chunk_index: chunkIndex,
    });
  }

  console.log(`[TranscriptLoader] Created ${chunks.length} chunks from ${segments.length} segments`);
  return chunks;
}

/**
 * Get last N tokens from text (approximate)
 */
function getLastNTokens(text: string, tokens: number): string {
  const chars = tokens * 4; // Rough approximation
  return text.slice(-chars);
}
