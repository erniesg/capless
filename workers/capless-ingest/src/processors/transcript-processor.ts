/**
 * Transcript processor - converts Hansard JSON to ProcessedTranscript format
 */

import { parseHansardHTML } from "../parsers/html-parser";
import { normalizeSittingDate, generateTranscriptId } from "../clients/hansard-api";
import type {
  HansardJSON,
  ProcessedTranscript,
  TranscriptSegment,
} from "../types";

/**
 * Calculate word count from text
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * Extract metadata from Hansard JSON
 */
export function extractMetadata(hansard: HansardJSON) {
  const { metadata, attendanceList } = hansard;

  // Filter only MPs who attended
  const attendance = attendanceList
    .filter((record) => record.attendance)
    .map((record) => record.mpName);

  return {
    parliament_no: metadata.parlimentNO,
    session_no: metadata.sessionNO,
    volume_no: metadata.volumeNO,
    start_time: metadata.startTimeStr,
    speaker_of_parliament: metadata.speaker,
    attendance,
    total_segments: 0, // Will be updated after processing
    total_words: 0, // Will be updated after processing
    processing_timestamp: new Date().toISOString(),
    source_url: `https://sprs.parl.gov.sg/search/getHansardReport/?sittingDate=${metadata.sittingDate}`,
  };
}

/**
 * Create transcript segments from all sections
 */
export function createTranscriptSegments(
  hansard: HansardJSON,
  transcriptId: string
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let globalSegmentIndex = 0;

  for (const section of hansard.takesSectionVOList) {
    if (!section.content || section.content.trim().length === 0) {
      continue; // Skip empty sections
    }

    // Parse HTML content
    const parseResult = parseHansardHTML(section.content);

    // Create segments from parsed speeches
    for (const speech of parseResult.speeches) {
      const cleanText = speech.text;
      const wordCount = countWords(cleanText);
      const charCount = cleanText.length;

      const segment: TranscriptSegment = {
        id: `${transcriptId}-${globalSegmentIndex}`,
        speaker: speech.speaker,
        text: cleanText,
        timestamp: speech.timestamp,
        section_title: section.title,
        section_type: section.sectionType,
        page_number: section.startPgNo,
        segment_index: globalSegmentIndex,
        word_count: wordCount,
        char_count: charCount,
      };

      segments.push(segment);
      globalSegmentIndex++;
    }
  }

  return segments;
}

/**
 * Process Hansard JSON into structured ProcessedTranscript
 */
export function processHansardJSON(
  hansard: HansardJSON,
  customTranscriptId?: string
): ProcessedTranscript {
  // Generate or use custom transcript ID
  const transcriptId =
    customTranscriptId ||
    generateTranscriptId(
      hansard.metadata.sittingDate,
      hansard.metadata.parlimentNO,
      hansard.metadata.sessionNO
    );

  // Normalize sitting date to ISO format
  const sittingDate = normalizeSittingDate(hansard.metadata.sittingDate);

  // Create segments
  const segments = createTranscriptSegments(hansard, transcriptId);

  // Extract unique speakers from segments
  const speakersSet = new Set<string>();
  segments.forEach((segment) => speakersSet.add(segment.speaker));
  const speakers = Array.from(speakersSet);

  // Extract unique topics (section titles)
  const topicsSet = new Set<string>();
  hansard.takesSectionVOList.forEach((section) =>
    topicsSet.add(section.title)
  );
  const topics = Array.from(topicsSet);

  // Calculate total words
  const totalWords = segments.reduce(
    (sum, segment) => sum + segment.word_count,
    0
  );

  // Extract metadata
  const metadata = extractMetadata(hansard);
  metadata.total_segments = segments.length;
  metadata.total_words = totalWords;

  // Construct ProcessedTranscript
  const processedTranscript: ProcessedTranscript = {
    transcript_id: transcriptId,
    sitting_date: sittingDate,
    date_display: hansard.metadata.dateToDisplay,
    speakers,
    topics,
    segments,
    metadata,
  };

  return processedTranscript;
}
