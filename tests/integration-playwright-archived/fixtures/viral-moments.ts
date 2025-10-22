/**
 * Test fixtures for viral moments detected from transcripts
 * Used for moments worker integration tests
 */

import type { ViralMoment, ExtractionResult } from '../../../workers/moments/src/types';

/**
 * High virality moment - "Cake and eat it too"
 */
export const CAKE_MOMENT: ViralMoment = {
  moment_id: 'moment-2024-07-02-001',
  quote: 'Mr Speaker, I think the Minister is trying to have his cake and eat it too.',
  speaker: 'Leader of Opposition',
  timestamp_start: '2:15 PM',
  timestamp_end: '2:17 PM',
  context_before: 'The budget debate continues with questions about fiscal responsibility.',
  context_after: 'The Minister responds defending the government\'s spending plans.',
  virality_score: 8.5,
  why_viral: 'Classic political idiom used in confrontational context, relatable metaphor about hypocrisy that resonates across demographics',
  topic: 'Budget Debate',
  emotional_tone: 'confrontational, witty',
  target_demographic: 'politically engaged millennials',
  embedding: Array.from({ length: 1536 }, () => Math.random() * 2 - 1),
  section_title: 'Oral Answers to Questions',
  transcript_id: '2024-07-02-sitting-1',
  segment_ids: ['2024-07-02-sitting-1-0'],
  created_at: '2024-07-02T14:20:00Z',
};

/**
 * High virality moment - Climate action
 */
export const CLIMATE_MOMENT: ViralMoment = {
  moment_id: 'moment-2024-07-02-002',
  quote: 'We cannot continue to kick the can down the road on climate action.',
  speaker: 'Minister for Sustainability',
  timestamp_start: '3:30 PM',
  timestamp_end: '3:32 PM',
  context_before: 'Discussion shifts to environmental policies and Green Plan 2030.',
  context_after: 'Opposition raises concerns about costs for small businesses.',
  virality_score: 7.8,
  why_viral: 'Urgent climate message with vivid metaphor, appeals to environmental consciousness and youth activism',
  topic: 'Climate Change',
  emotional_tone: 'urgent, concerned',
  target_demographic: 'gen z climate activists',
  embedding: Array.from({ length: 1536 }, () => Math.random() * 2 - 1),
  section_title: 'Climate Change and Sustainability',
  transcript_id: '2024-07-02-sitting-1',
  segment_ids: ['2024-07-02-sitting-1-3'],
  created_at: '2024-07-02T15:35:00Z',
};

/**
 * Medium virality moment - Housing affordability
 */
export const HOUSING_MOMENT: ViralMoment = {
  moment_id: 'moment-2024-07-02-003',
  quote: 'This is the sandwich class problem - too rich for help, too poor to afford.',
  speaker: 'Dr Tan Cheng Bock',
  timestamp_start: '4:17 PM',
  context_before: 'Minister defends housing affordability measures.',
  context_after: 'Further debate on middle-income support schemes.',
  virality_score: 6.8,
  why_viral: 'Relatable economic struggle affecting many Singaporeans, touches on class inequality',
  topic: 'Housing Affordability',
  emotional_tone: 'concerned, empathetic',
  target_demographic: 'working professionals, young families',
  embedding: Array.from({ length: 1536 }, () => Math.random() * 2 - 1),
  section_title: 'Housing and Development',
  transcript_id: '2024-07-02-sitting-1',
  segment_ids: ['2024-07-02-sitting-1-5'],
  created_at: '2024-07-02T16:20:00Z',
};

/**
 * Lower virality moment - Technical jargon
 */
export const TECHNICAL_MOMENT: ViralMoment = {
  moment_id: 'moment-2024-07-02-004',
  quote: 'The fiscal multiplier effect of our infrastructure spending will compound over time.',
  speaker: 'Minister for Finance',
  context_before: 'Responding to questions about economic impact.',
  context_after: 'Opposition requests simpler explanation for constituents.',
  virality_score: 4.2,
  why_viral: 'Contains economic jargon that may limit viral spread but appeals to policy wonks',
  topic: 'Economic Policy',
  emotional_tone: 'technical, formal',
  target_demographic: 'policy analysts, economists',
  embedding: Array.from({ length: 1536 }, () => Math.random() * 2 - 1),
  section_title: 'Economic Affairs',
  transcript_id: '2024-07-02-sitting-1',
  segment_ids: ['2024-07-02-sitting-1-7'],
  created_at: '2024-07-02T14:45:00Z',
};

/**
 * Complete extraction result
 */
export const EXTRACTION_RESULT: ExtractionResult = {
  transcript_id: '2024-07-02-sitting-1',
  moments: [
    CAKE_MOMENT,
    CLIMATE_MOMENT,
    HOUSING_MOMENT,
    TECHNICAL_MOMENT,
  ],
  top_moment: CAKE_MOMENT,
  statistics: {
    total_segments_analyzed: 100,
    moments_found: 4,
    avg_virality_score: 6.83,
    topics: {
      'Budget Debate': 1,
      'Climate Change': 1,
      'Housing Affordability': 1,
      'Economic Policy': 1,
    },
    speakers: {
      'Leader of Opposition': 1,
      'Minister for Sustainability': 1,
      'Dr Tan Cheng Bock': 1,
      'Minister for Finance': 1,
    },
    emotional_tones: {
      'confrontational, witty': 1,
      'urgent, concerned': 1,
      'concerned, empathetic': 1,
      'technical, formal': 1,
    },
  },
  processed_at: '2024-07-02T16:30:00Z',
  model_used: 'gpt-4o-2024-08-06',
};

/**
 * Extraction result with only high-scoring moments (filtered)
 */
export const HIGH_SCORE_EXTRACTION: ExtractionResult = {
  transcript_id: '2024-07-02-sitting-1',
  moments: [CAKE_MOMENT, CLIMATE_MOMENT],
  top_moment: CAKE_MOMENT,
  statistics: {
    total_segments_analyzed: 100,
    moments_found: 2,
    avg_virality_score: 8.15,
    topics: {
      'Budget Debate': 1,
      'Climate Change': 1,
    },
    speakers: {
      'Leader of Opposition': 1,
      'Minister for Sustainability': 1,
    },
    emotional_tones: {
      'confrontational, witty': 1,
      'urgent, concerned': 1,
    },
  },
  processed_at: '2024-07-02T16:30:00Z',
  model_used: 'gpt-4o-2024-08-06',
};

/**
 * Empty extraction result (no viral moments found)
 */
export const EMPTY_EXTRACTION: ExtractionResult = {
  transcript_id: '2024-07-02-sitting-2',
  moments: [],
  statistics: {
    total_segments_analyzed: 1,
    moments_found: 0,
    avg_virality_score: 0,
    topics: {},
    speakers: {},
    emotional_tones: {},
  },
  processed_at: '2024-07-02T12:35:00Z',
  model_used: 'gpt-4o-2024-08-06',
};

/**
 * Sample extraction criteria
 */
export const EXTRACTION_CRITERIA = {
  default: {
    min_score: 5.0,
    max_results: 20,
  },
  high_quality: {
    min_score: 7.0,
    max_results: 10,
  },
  filtered_by_topic: {
    min_score: 5.0,
    max_results: 20,
    topics: ['Climate Change', 'Budget Debate'],
  },
  filtered_by_speaker: {
    min_score: 5.0,
    max_results: 20,
    speakers: ['Leader of Opposition', 'Minister for Sustainability'],
  },
  jargon_free: {
    min_score: 5.0,
    max_results: 20,
    require_jargon: false,
  },
};

/**
 * Helper to create a custom viral moment
 */
export function createViralMoment(options: {
  momentId: string;
  quote: string;
  speaker: string;
  viralityScore: number;
  topic: string;
  transcriptId: string;
}): ViralMoment {
  return {
    moment_id: options.momentId,
    quote: options.quote,
    speaker: options.speaker,
    context_before: 'Context before the moment.',
    context_after: 'Context after the moment.',
    virality_score: options.viralityScore,
    why_viral: `Viral because: ${options.topic}`,
    topic: options.topic,
    emotional_tone: 'neutral',
    target_demographic: 'general public',
    embedding: Array.from({ length: 1536 }, () => Math.random() * 2 - 1),
    transcript_id: options.transcriptId,
    segment_ids: [`${options.transcriptId}-0`],
    created_at: new Date().toISOString(),
  };
}

/**
 * Sample moment IDs for testing
 */
export const MOMENT_IDS = {
  cake: 'moment-2024-07-02-001',
  climate: 'moment-2024-07-02-002',
  housing: 'moment-2024-07-02-003',
  technical: 'moment-2024-07-02-004',
};

/**
 * Helper to get moment by ID
 */
export function getMomentById(momentId: string): ViralMoment | undefined {
  const moments: Record<string, ViralMoment> = {
    [MOMENT_IDS.cake]: CAKE_MOMENT,
    [MOMENT_IDS.climate]: CLIMATE_MOMENT,
    [MOMENT_IDS.housing]: HOUSING_MOMENT,
    [MOMENT_IDS.technical]: TECHNICAL_MOMENT,
  };
  return moments[momentId];
}

/**
 * Batch extraction request fixture
 */
export const BATCH_EXTRACTION_REQUEST = {
  transcript_ids: [
    '2024-07-02-sitting-1',
    '2024-07-09-sitting-1',
    '2024-07-16-sitting-1',
  ],
  criteria: EXTRACTION_CRITERIA.default,
};
