/**
 * Chunking utilities for Hansard transcripts
 * Section-aware chunking that respects Q&A boundaries
 */

import { stripHtml } from './extraction';
import type { ChunkMetadata } from './extraction';

export interface HansardSection {
  content: string;
  title?: string;
  sectionType?: string;
  // Add Parliament API fields for metadata
  startPgNo?: number;
  endPgNo?: number;
  questionNo?: string;
  subTitle?: string;
}

export interface HansardData {
  takesSectionVOList: HansardSection[];
  metadata?: {
    parlimentNO?: number;     // Note: API has typo "parliment"
    sessionNO?: number;
    volumeNO?: number;
    sittingNO?: number;
    sittingDate?: string;
    partSessionStr?: string;
    dateToDisplay?: string;
  };
}

export interface Chunk {
  text: string;
  metadata: ChunkMetadata;
}

/**
 * Chunk Hansard data by section boundaries with rich metadata
 * Respects Q&A boundaries and keeps related content together
 */
export function chunkBySections(data: HansardData): Chunk[] {
  const sections = data.takesSectionVOList || [];

  if (sections.length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;
  let currentSectionNums: number[] = [];
  let currentSectionTitles: string[] = [];
  let currentSectionTypes: string[] = [];
  // NEW: Track page ranges and HTML
  let currentPageRanges: Array<{section_id: number; start_page?: number; end_page?: number; question_no?: string}> = [];
  let currentSectionHtml: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const contentHtml = section.content || '';
    const contentText = stripHtml(contentHtml);
    const sectionSize = contentText.length;

    const title = section.title || 'N/A';
    const sectionType = section.sectionType || 'N/A';
    const sectionNum = i + 1;

    // NEW: Capture page metadata
    const pageMetadata = {
      section_id: sectionNum,
      start_page: section.startPgNo,
      end_page: section.endPgNo,
      question_no: section.questionNo
    };

    if (sectionSize > 80000) {
      // Large section - flush current chunk first
      if (currentChunk.length > 0) {
        const chunkText = currentChunk.join('\n\n');
        chunks.push({
          text: chunkText,
          metadata: {
            chunk_id: `chunk-${String(chunks.length + 1).padStart(3, '0')}`,
            sections: currentSectionNums,
            section_titles: currentSectionTitles,
            section_types: currentSectionTypes,
            type: 'combined',
            char_count: currentSize,
            section_page_ranges: currentPageRanges,
            section_html: currentSectionHtml
          }
        });
        currentChunk = [];
        currentSize = 0;
        currentSectionNums = [];
        currentSectionTitles = [];
        currentSectionTypes = [];
        currentPageRanges = [];
        currentSectionHtml = [];
      }

      // Add large section as its own chunk
      chunks.push({
        text: contentText,
        metadata: {
          chunk_id: `chunk-${String(chunks.length + 1).padStart(3, '0')}`,
          sections: [sectionNum],
          section_titles: [title],
          section_types: [sectionType],
          type: 'large',
          char_count: sectionSize,
          section_page_ranges: [pageMetadata],
          section_html: [contentHtml]
        }
      });

    } else if (currentSize + sectionSize > 60000) {
      // Current chunk would exceed limit - flush it
      if (currentChunk.length > 0) {
        const chunkText = currentChunk.join('\n\n');
        chunks.push({
          text: chunkText,
          metadata: {
            chunk_id: `chunk-${String(chunks.length + 1).padStart(3, '0')}`,
            sections: currentSectionNums,
            section_titles: currentSectionTitles,
            section_types: currentSectionTypes,
            type: 'combined',
            char_count: currentSize,
            section_page_ranges: currentPageRanges,
            section_html: currentSectionHtml
          }
        });
      }

      // Start new chunk with this section
      currentChunk = [contentText];
      currentSize = sectionSize;
      currentSectionNums = [sectionNum];
      currentSectionTitles = [title];
      currentSectionTypes = [sectionType];
      currentPageRanges = [pageMetadata];
      currentSectionHtml = [contentHtml];

    } else {
      // Add to current chunk
      currentChunk.push(contentText);
      currentSize += sectionSize;
      currentSectionNums.push(sectionNum);
      currentSectionTitles.push(title);
      currentSectionTypes.push(sectionType);
      currentPageRanges.push(pageMetadata);
      currentSectionHtml.push(contentHtml);
    }
  }

  // Flush remaining chunk
  if (currentChunk.length > 0) {
    const chunkText = currentChunk.join('\n\n');
    chunks.push({
      text: chunkText,
      metadata: {
        chunk_id: `chunk-${String(chunks.length + 1).padStart(3, '0')}`,
        sections: currentSectionNums,
        section_titles: currentSectionTitles,
        section_types: currentSectionTypes,
        type: 'combined',
        char_count: currentSize,
        section_page_ranges: currentPageRanges,
        section_html: currentSectionHtml
      }
    });
  }

  return chunks;
}

/**
 * Fetch Hansard transcript from R2 storage
 */
export async function fetchHansard(dateStr: string, r2Bucket: R2Bucket): Promise<HansardData | null> {
  try {
    // Hansard files are stored as: hansard/cleaned/{DD-MM-YYYY}.json (structured with takesSectionVOList)
    const r2Key = `hansard/cleaned/${dateStr}.json`;
    console.error(`📥 Fetching Hansard from R2: ${r2Key}...`);

    const object = await r2Bucket.get(r2Key);

    if (!object) {
      console.error(`❌ File not found in R2: ${r2Key}`);
      return null;
    }

    const content = await object.text();
    const data = JSON.parse(content) as HansardData;

    const sections = data.takesSectionVOList || [];
    if (sections.length === 0) {
      console.error('❌ No sections found in Hansard');
      return null;
    }

    console.error(`✅ Fetched Hansard from R2: ${sections.length} sections`);
    return data;

  } catch (error) {
    console.error(`❌ Error fetching Hansard from R2: ${error}`);
    return null;
  }
}
