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
}

export interface HansardData {
  takesSectionVOList: HansardSection[];
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

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const contentHtml = section.content || '';
    const contentText = stripHtml(contentHtml);
    const sectionSize = contentText.length;

    const title = section.title || 'N/A';
    const sectionType = section.sectionType || 'N/A';
    const sectionNum = i + 1;

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
            char_count: currentSize
          }
        });
        currentChunk = [];
        currentSize = 0;
        currentSectionNums = [];
        currentSectionTitles = [];
        currentSectionTypes = [];
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
          char_count: sectionSize
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
            char_count: currentSize
          }
        });
      }

      // Start new chunk with this section
      currentChunk = [contentText];
      currentSize = sectionSize;
      currentSectionNums = [sectionNum];
      currentSectionTitles = [title];
      currentSectionTypes = [sectionType];

    } else {
      // Add to current chunk
      currentChunk.push(contentText);
      currentSize += sectionSize;
      currentSectionNums.push(sectionNum);
      currentSectionTitles.push(title);
      currentSectionTypes.push(sectionType);
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
        char_count: currentSize
      }
    });
  }

  return chunks;
}

/**
 * Fetch Hansard transcript from Parliament API
 */
export async function fetchHansard(dateStr: string): Promise<HansardData | null> {
  try {
    // Convert YYYY-MM-DD to DD-MM-YYYY
    const [year, month, day] = dateStr.split('-');
    const apiDate = `${day}-${month}-${year}`;

    const url = `https://sprs.parl.gov.sg/search/getHansardReport?sittingDate=${apiDate}`;
    console.error(`📥 Fetching Hansard from ${url}...`);

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`❌ Failed to fetch: ${response.status}`);
      return null;
    }

    const data = await response.json() as HansardData;

    const sections = data.takesSectionVOList || [];
    if (sections.length === 0) {
      console.error('❌ No sections found in Hansard');
      return null;
    }

    console.error(`✅ Fetched Hansard: ${sections.length} sections`);
    return data;

  } catch (error) {
    console.error(`❌ Error fetching Hansard: ${error}`);
    return null;
  }
}
