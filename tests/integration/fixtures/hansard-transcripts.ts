/**
 * Test fixtures for Hansard transcripts and processed data
 * Used across integration tests for consistent test data
 */

import type { ProcessedTranscript, TranscriptSegment } from '../../../workers/capless-ingest/src/types';

/**
 * Sample processed transcript segments
 */
export const SAMPLE_SEGMENTS: TranscriptSegment[] = [
  {
    id: '2024-07-02-sitting-1-0',
    speaker: 'Leader of Opposition',
    text: 'Mr Speaker, I think the Minister is trying to have his cake and eat it too. On one hand, he claims fiscal responsibility, but on the other, he proposes massive spending without clear revenue sources.',
    timestamp: '2:15 PM',
    section_title: 'Oral Answers to Questions',
    section_type: 'OA',
    page_number: 1,
    segment_index: 0,
    word_count: 38,
    char_count: 228,
  },
  {
    id: '2024-07-02-sitting-1-1',
    speaker: 'Minister for Finance',
    text: 'I thank the Member for his question. Let me clarify that our fiscal position remains strong, with reserves that can sustain our commitments. The spending is targeted and necessary for our future.',
    timestamp: '2:17 PM',
    section_title: 'Oral Answers to Questions',
    section_type: 'OA',
    page_number: 1,
    segment_index: 1,
    word_count: 36,
    char_count: 218,
  },
  {
    id: '2024-07-02-sitting-1-2',
    speaker: 'Ms Sylvia Lim',
    text: 'Mr Speaker, may I ask for clarification? The Minister mentions reserves, but can he provide specific figures on how much will be drawn down?',
    timestamp: '2:19 PM',
    section_title: 'Oral Answers to Questions',
    section_type: 'OA',
    page_number: 1,
    segment_index: 2,
    word_count: 27,
    char_count: 143,
  },
  {
    id: '2024-07-02-sitting-1-3',
    speaker: 'Minister for Sustainability',
    text: 'We cannot continue to kick the can down the road on climate action. The science is clear, the urgency is real, and we must act now. Our Green Plan 2030 sets ambitious targets that will transform our economy.',
    timestamp: '3:30 PM',
    section_title: 'Climate Change and Sustainability',
    section_type: 'OS',
    page_number: 15,
    segment_index: 3,
    word_count: 43,
    char_count: 245,
  },
  {
    id: '2024-07-02-sitting-1-4',
    speaker: 'Mr Leong Mun Wai',
    text: 'Mr Speaker, while I appreciate the ambition, can the Minister address the concerns of small businesses who worry about the costs of compliance with these new regulations?',
    timestamp: '3:32 PM',
    section_title: 'Climate Change and Sustainability',
    section_type: 'OS',
    page_number: 15,
    segment_index: 4,
    word_count: 31,
    char_count: 180,
  },
];

/**
 * Complete processed transcript fixture
 */
export const COMPLETE_TRANSCRIPT: ProcessedTranscript = {
  transcript_id: '2024-07-02-sitting-1',
  sitting_date: '2024-07-02',
  date_display: 'Tuesday, 2 July 2024',
  speakers: [
    'Leader of Opposition',
    'Minister for Finance',
    'Ms Sylvia Lim',
    'Minister for Sustainability',
    'Mr Leong Mun Wai',
  ],
  topics: [
    'Oral Answers to Questions',
    'Climate Change and Sustainability',
  ],
  segments: SAMPLE_SEGMENTS,
  metadata: {
    parliament_no: 15,
    session_no: 1,
    volume_no: 1,
    start_time: '12:00 noon',
    speaker_of_parliament: 'Speaker Tan Chuan-Jin',
    attendance: [
      'Prime Minister Lee Hsien Loong',
      'Deputy Prime Minister Lawrence Wong',
      'Minister for Finance',
      'Leader of Opposition Pritam Singh',
      'Ms Sylvia Lim',
    ],
    total_segments: 5,
    total_words: 175,
    processing_timestamp: '2024-07-02T12:00:00Z',
    source_url: 'https://sprs.parl.gov.sg/search/getHansard?sittingDate=02-07-2024',
  },
};

/**
 * Minimal transcript (edge case)
 */
export const MINIMAL_TRANSCRIPT: ProcessedTranscript = {
  transcript_id: '2024-07-02-sitting-2',
  sitting_date: '2024-07-02',
  date_display: 'Tuesday, 2 July 2024',
  speakers: ['Speaker Tan Chuan-Jin'],
  topics: ['Procedural'],
  segments: [
    {
      id: '2024-07-02-sitting-2-0',
      speaker: 'Speaker Tan Chuan-Jin',
      text: 'Parliament is adjourned.',
      section_title: 'Procedural',
      section_type: 'OTHER',
      page_number: 1,
      segment_index: 0,
      word_count: 3,
      char_count: 24,
    },
  ],
  metadata: {
    parliament_no: 15,
    session_no: 1,
    start_time: '12:00 noon',
    speaker_of_parliament: 'Speaker Tan Chuan-Jin',
    attendance: ['Speaker Tan Chuan-Jin'],
    total_segments: 1,
    total_words: 3,
    processing_timestamp: '2024-07-02T12:30:00Z',
    source_url: 'https://sprs.parl.gov.sg/search/getHansard?sittingDate=02-07-2024',
  },
};

/**
 * Large transcript with many segments
 */
export const LARGE_TRANSCRIPT: ProcessedTranscript = {
  transcript_id: '2024-07-02-sitting-3',
  sitting_date: '2024-07-02',
  date_display: 'Tuesday, 2 July 2024',
  speakers: ['Speaker', 'MP1', 'MP2', 'MP3', 'Minister'],
  topics: ['Debate'],
  segments: Array.from({ length: 100 }, (_, i) => ({
    id: `2024-07-02-sitting-3-${i}`,
    speaker: `Speaker ${i % 5}`,
    text: `This is segment ${i} with some parliamentary discussion content.`,
    section_title: 'Debate',
    section_type: 'OA' as const,
    page_number: Math.floor(i / 10) + 1,
    segment_index: i,
    word_count: 10,
    char_count: 65,
  })),
  metadata: {
    parliament_no: 15,
    session_no: 1,
    start_time: '12:00 noon',
    speaker_of_parliament: 'Speaker Tan Chuan-Jin',
    attendance: ['Speaker', 'MP1', 'MP2', 'MP3', 'Minister'],
    total_segments: 100,
    total_words: 1000,
    processing_timestamp: '2024-07-02T12:00:00Z',
    source_url: 'https://sprs.parl.gov.sg/search/getHansard?sittingDate=02-07-2024',
  },
};

/**
 * Sample sitting dates for testing
 */
export const SITTING_DATES = [
  '2024-07-02',
  '2024-07-09',
  '2024-07-16',
  '2024-07-23',
];

/**
 * Helper to get transcript by ID
 */
export function getTranscriptById(transcriptId: string): ProcessedTranscript | undefined {
  const transcripts: Record<string, ProcessedTranscript> = {
    '2024-07-02-sitting-1': COMPLETE_TRANSCRIPT,
    '2024-07-02-sitting-2': MINIMAL_TRANSCRIPT,
    '2024-07-02-sitting-3': LARGE_TRANSCRIPT,
  };
  return transcripts[transcriptId];
}

/**
 * Helper to create a custom transcript
 */
export function createCustomTranscript(options: {
  transcriptId: string;
  sittingDate: string;
  segments: TranscriptSegment[];
  speakers: string[];
}): ProcessedTranscript {
  return {
    transcript_id: options.transcriptId,
    sitting_date: options.sittingDate,
    date_display: new Date(options.sittingDate).toLocaleDateString('en-SG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    speakers: options.speakers,
    topics: [...new Set(options.segments.map(s => s.section_title))],
    segments: options.segments,
    metadata: {
      parliament_no: 15,
      session_no: 1,
      start_time: '12:00 noon',
      speaker_of_parliament: 'Speaker Tan Chuan-Jin',
      attendance: options.speakers,
      total_segments: options.segments.length,
      total_words: options.segments.reduce((sum, s) => sum + s.word_count, 0),
      processing_timestamp: new Date().toISOString(),
      source_url: `https://sprs.parl.gov.sg/search/getHansard?sittingDate=${options.sittingDate}`,
    },
  };
}
