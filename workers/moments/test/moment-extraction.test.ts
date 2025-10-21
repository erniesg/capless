import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ProcessedTranscript, ViralMoment, ExtractionCriteria } from '../src/types';
import { MomentExtractor } from '../src/extractor';
import { ViralityScorer } from '../src/scorer';

// Mock transcript data
const mockTranscript: ProcessedTranscript = {
  transcript_id: 'transcript-001',
  session_id: 'session-2025-01',
  date: '2025-01-15',
  title: 'Healthcare Premium Debate',
  segments: [
    {
      segment_id: 'seg-001',
      speaker: 'Mr Lee',
      text: 'I would like to ask the Minister about the recent increase in healthcare premiums.',
      order: 0,
    },
    {
      segment_id: 'seg-002',
      speaker: 'Minister Tan',
      text: 'The increase is necessary to ensure long-term sustainability of our healthcare system. We have conducted extensive actuarial analysis.',
      order: 1,
    },
    {
      segment_id: 'seg-003',
      speaker: 'Mr Lee',
      text: 'But Minister, many families are already struggling with cost of living. How do you expect them to afford this?',
      order: 2,
    },
    {
      segment_id: 'seg-004',
      speaker: 'Minister Tan',
      text: "I understand the concern. We have put in place various support mechanisms and subsidies. The increase is actually quite modest when you factor in the comprehensive coverage enhancement package and the inter-generational risk-pooling optimization framework.",
      order: 3,
    },
    {
      segment_id: 'seg-005',
      speaker: 'Mr Lee',
      text: 'Minister, that sounds like a lot of jargon. Can you explain in simple terms?',
      order: 4,
    },
    {
      segment_id: 'seg-006',
      speaker: 'Minister Tan',
      text: 'Certainly. What I mean is that we are spreading the risk across different age groups to keep premiums affordable.',
      order: 5,
    },
  ],
  metadata: {
    speakers: ['Mr Lee', 'Minister Tan'],
    topics: ['Healthcare', 'Insurance'],
    total_segments: 6,
  },
};

describe('MomentExtractor', () => {
  let extractor: MomentExtractor;
  let mockOpenAI: any;

  beforeEach(() => {
    // Mock OpenAI client
    mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
      embeddings: {
        create: vi.fn(),
      },
    };

    extractor = new MomentExtractor(mockOpenAI, 'gpt-4o');
  });

  describe('extractMoments', () => {
    it('should extract viral moments from transcript', async () => {
      // Mock AI response
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  quote: "The increase is actually quite modest when you factor in the comprehensive coverage enhancement package and the inter-generational risk-pooling optimization framework.",
                  speaker: "Minister Tan",
                  why_viral: "Dense bureaucratic jargon that obscures a simple concept - viral because it exemplifies government doublespeak",
                  ai_score: 8.5,
                  topic: "Healthcare",
                  emotional_tone: "defensive",
                  target_demographic: "working class",
                  contains_jargon: true,
                  has_contradiction: false,
                  affects_everyday_life: true,
                  segment_indices: [3],
                },
              ]),
            },
          },
        ],
      });

      const result = await extractor.extractMoments(mockTranscript);

      expect(result.moments).toHaveLength(1);
      expect(result.moments[0]?.quote).toContain('comprehensive coverage enhancement package');
      expect(result.moments[0]?.virality_score).toBeGreaterThan(5);
      expect(result.moments[0]?.speaker).toBe('Minister Tan');
    });

    it('should include context before and after moment', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  quote: "The increase is actually quite modest when you factor in the comprehensive coverage enhancement package and the inter-generational risk-pooling optimization framework.",
                  speaker: "Minister Tan",
                  why_viral: "Bureaucratic jargon",
                  ai_score: 8.5,
                  topic: "Healthcare",
                  emotional_tone: "defensive",
                  target_demographic: "working class",
                  contains_jargon: true,
                  has_contradiction: false,
                  affects_everyday_life: true,
                  segment_indices: [3],
                },
              ]),
            },
          },
        ],
      });

      const result = await extractor.extractMoments(mockTranscript);

      expect(result.moments[0]?.context_before).toContain('many families are already struggling');
      expect(result.moments[0]?.context_after).toContain('sounds like a lot of jargon');
    });

    it('should filter moments by minimum virality score', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  quote: "High score quote",
                  speaker: "Minister Tan",
                  why_viral: "Reason",
                  ai_score: 8.0,
                  topic: "Healthcare",
                  emotional_tone: "defensive",
                  target_demographic: "working class",
                  contains_jargon: true,
                  has_contradiction: false,
                  affects_everyday_life: true,
                  segment_indices: [3],
                },
                {
                  quote: "Low score quote",
                  speaker: "Mr Lee",
                  why_viral: "Reason",
                  ai_score: 3.0,
                  topic: "Healthcare",
                  emotional_tone: "neutral",
                  target_demographic: "general",
                  contains_jargon: false,
                  has_contradiction: false,
                  affects_everyday_life: false,
                  segment_indices: [1],
                },
              ]),
            },
          },
        ],
      });

      const criteria: ExtractionCriteria = {
        min_score: 5.0,
        max_results: 20,
      };

      const result = await extractor.extractMoments(mockTranscript, criteria);

      expect(result.moments).toHaveLength(1);
      expect(result.moments[0]?.virality_score).toBeGreaterThanOrEqual(5.0);
    });

    it('should respect max_results limit', async () => {
      const manyMoments = Array.from({ length: 30 }, (_, i) => ({
        quote: `Quote ${i}`,
        speaker: "Minister Tan",
        why_viral: "Reason",
        ai_score: 7.0,
        topic: "Healthcare",
        emotional_tone: "defensive",
        target_demographic: "working class",
        contains_jargon: true,
        has_contradiction: false,
        affects_everyday_life: true,
        segment_indices: [i],
      }));

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify(manyMoments),
            },
          },
        ],
      });

      const criteria: ExtractionCriteria = {
        min_score: 0,
        max_results: 10,
      };

      const result = await extractor.extractMoments(mockTranscript, criteria);

      expect(result.moments.length).toBeLessThanOrEqual(10);
    });

    it('should calculate statistics correctly', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  quote: "Quote 1",
                  speaker: "Minister Tan",
                  why_viral: "Reason",
                  ai_score: 8.0,
                  topic: "Healthcare",
                  emotional_tone: "defensive",
                  target_demographic: "working class",
                  contains_jargon: true,
                  has_contradiction: false,
                  affects_everyday_life: true,
                  segment_indices: [3],
                },
                {
                  quote: "Quote 2",
                  speaker: "Mr Lee",
                  why_viral: "Reason",
                  ai_score: 6.0,
                  topic: "Insurance",
                  emotional_tone: "concerned",
                  target_demographic: "working class",
                  contains_jargon: false,
                  has_contradiction: false,
                  affects_everyday_life: true,
                  segment_indices: [2],
                },
              ]),
            },
          },
        ],
      });

      const result = await extractor.extractMoments(mockTranscript);

      expect(result.statistics.total_segments_analyzed).toBe(6);
      expect(result.statistics.moments_found).toBe(2);
      expect(result.statistics.avg_virality_score).toBeCloseTo(7.0, 1);
      expect(result.statistics.topics).toHaveProperty('Healthcare');
      expect(result.statistics.speakers).toHaveProperty('Minister Tan');
    });
  });

  describe('generatePrompt', () => {
    it('should create effective prompt for AI analysis', () => {
      const prompt = extractor.generatePrompt(mockTranscript);

      expect(prompt).toContain('Singapore Parliament');
      expect(prompt).toContain('bureaucratic jargon');
      expect(prompt).toContain('contradictions');
      expect(prompt).toContain('JSON array');
      expect(prompt).toContain('Mr Lee');
      expect(prompt).toContain('Minister Tan');
    });

    it('should include all segments in prompt', () => {
      const prompt = extractor.generatePrompt(mockTranscript);

      expect(prompt).toContain('healthcare premiums');
      expect(prompt).toContain('comprehensive coverage enhancement package');
    });
  });
});

describe('ViralityScorer', () => {
  let scorer: ViralityScorer;

  beforeEach(() => {
    scorer = new ViralityScorer();
  });

  describe('calculateScore', () => {
    it('should score jargon-heavy quotes highly', () => {
      const moment: Partial<ViralMoment> = {
        quote: "We are implementing a comprehensive inter-generational risk-pooling optimization framework with actuarial sustainability mechanisms.",
        topic: "Healthcare",
      };

      const score = scorer.calculateJargonScore(moment.quote);

      expect(score).toBeGreaterThan(0.5);
    });

    it('should detect contradictions', () => {
      const contradictoryQuote = "The increase is modest but premiums will rise significantly.";
      const hasContradiction = scorer.detectContradiction(contradictoryQuote);

      expect(hasContradiction).toBe(true);
    });

    it('should bonus points for everyday life topics', () => {
      const everydayTopics = ['Healthcare', 'Housing', 'Education', 'Transport'];

      everydayTopics.forEach(topic => {
        expect(scorer.affectsEverydayLife(topic)).toBe(true);
      });
    });

    it('should score quotes within optimal word count range higher', () => {
      const optimalQuote = "This is a quote with about twenty words that should score well for quotability and shareability.";
      const tooShort = "Too short.";
      const tooLong = "This is a very long quote that goes on and on with unnecessary details and explanations that would not be suitable for a viral social media post because it exceeds the optimal length.";

      const optimalScore = scorer.calculateQuotabilityScore(optimalQuote);
      const shortScore = scorer.calculateQuotabilityScore(tooShort);
      const longScore = scorer.calculateQuotabilityScore(tooLong);

      expect(optimalScore).toBeGreaterThan(shortScore);
      expect(optimalScore).toBeGreaterThan(longScore);
    });

    it('should calculate final virality score correctly', () => {
      const mockAI = {
        quote: "The increase is actually quite modest when you factor in the comprehensive coverage enhancement package.",
        speaker: "Minister Tan",
        why_viral: "Bureaucratic jargon",
        ai_score: 8.0,
        topic: "Healthcare",
        emotional_tone: "defensive",
        target_demographic: "working class",
        contains_jargon: true,
        has_contradiction: false,
        affects_everyday_life: true,
        segment_indices: [3],
      };

      const finalScore = scorer.calculateFinalScore(mockAI);

      expect(finalScore).toBeGreaterThan(0);
      expect(finalScore).toBeLessThanOrEqual(10);
      expect(finalScore).toBeGreaterThan(mockAI.ai_score * 0.3); // AI score contributes
    });

    it('should cap final score at 10', () => {
      const mockAI = {
        quote: "Super viral bureaucratic inter-generational framework optimization package.",
        speaker: "Minister",
        why_viral: "All the jargon",
        ai_score: 10.0,
        topic: "Healthcare",
        emotional_tone: "defensive",
        target_demographic: "working class",
        contains_jargon: true,
        has_contradiction: true,
        affects_everyday_life: true,
        segment_indices: [0],
      };

      const finalScore = scorer.calculateFinalScore(mockAI);

      expect(finalScore).toBeLessThanOrEqual(10);
    });
  });
});

describe('Context Extraction', () => {
  it('should extract context from surrounding segments', () => {
    const extractor = new MomentExtractor({} as any, 'gpt-4o');

    const context = extractor.extractContext(mockTranscript.segments, 3, 1);

    expect(context.before).toContain('many families are already struggling');
    expect(context.after).toContain('sounds like a lot of jargon');
  });

  it('should handle edge cases at start of transcript', () => {
    const extractor = new MomentExtractor({} as any, 'gpt-4o');

    const context = extractor.extractContext(mockTranscript.segments, 0, 1);

    expect(context.before).toBe('');
    expect(context.after).toContain('The increase is necessary');
  });

  it('should handle edge cases at end of transcript', () => {
    const extractor = new MomentExtractor({} as any, 'gpt-4o');

    const lastIndex = mockTranscript.segments.length - 1;
    const context = extractor.extractContext(mockTranscript.segments, lastIndex, 1);

    expect(context.before).toContain('sounds like a lot of jargon');
    expect(context.after).toBe('');
  });
});

describe('Embedding Generation', () => {
  it('should generate embeddings for moments', async () => {
    const mockOpenAI = {
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [
            {
              embedding: new Array(1536).fill(0).map(() => Math.random()),
            },
          ],
        }),
      },
    };

    const extractor = new MomentExtractor(mockOpenAI as any, 'gpt-4o');

    const embedding = await extractor.generateEmbedding('Test moment text');

    expect(embedding).toHaveLength(1536);
    expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: 'Test moment text',
    });
  });
});
