/**
 * Mock factory for OpenAI API responses
 * Matches OpenAI API v4 response schemas
 */

import { z } from 'zod';

// ============================================================================
// OpenAI API Response Schemas (matching actual API)
// ============================================================================

export const ChatCompletionMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'function', 'tool']),
  content: z.string().nullable(),
  function_call: z.object({
    name: z.string(),
    arguments: z.string(),
  }).optional(),
  tool_calls: z.array(z.object({
    id: z.string(),
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
  })).optional(),
});

export const ChatCompletionChoiceSchema = z.object({
  index: z.number(),
  message: ChatCompletionMessageSchema,
  finish_reason: z.enum(['stop', 'length', 'function_call', 'tool_calls', 'content_filter']).nullable(),
});

export const ChatCompletionUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});

export const ChatCompletionResponseSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion'),
  created: z.number(),
  model: z.string(),
  choices: z.array(ChatCompletionChoiceSchema),
  usage: ChatCompletionUsageSchema,
  system_fingerprint: z.string().optional(),
});

export const EmbeddingObjectSchema = z.object({
  object: z.literal('embedding'),
  embedding: z.array(z.number()),
  index: z.number(),
});

export const EmbeddingResponseSchema = z.object({
  object: z.literal('list'),
  data: z.array(EmbeddingObjectSchema),
  model: z.string(),
  usage: z.object({
    prompt_tokens: z.number(),
    total_tokens: z.number(),
  }),
});

export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>;
export type EmbeddingResponse = z.infer<typeof EmbeddingResponseSchema>;

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Create a mock GPT-4o response for viral moment detection
 */
export function createViralMomentDetectionResponse(moments: Array<{
  quote: string;
  speaker: string;
  why_viral: string;
  ai_score: number;
  topic: string;
  emotional_tone: string;
  target_demographic: string;
  contains_jargon: boolean;
  has_contradiction: boolean;
  affects_everyday_life: boolean;
  segment_indices: number[];
}>): ChatCompletionResponse {
  return {
    id: `chatcmpl-${Math.random().toString(36).substring(7)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-4o-2024-08-06',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify({ moments }),
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 1500,
      completion_tokens: moments.length * 150,
      total_tokens: 1500 + moments.length * 150,
    },
  };
}

/**
 * Create a mock GPT-4o response for script generation
 */
export function createScriptGenerationResponse(scripts: Array<{
  persona: string;
  script: string;
  reasoning: string;
}>): ChatCompletionResponse {
  return {
    id: `chatcmpl-${Math.random().toString(36).substring(7)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-4o-2024-08-06',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify({ scripts }),
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 800,
      completion_tokens: scripts.length * 200,
      total_tokens: 800 + scripts.length * 200,
    },
  };
}

/**
 * Create a mock GPT-4o-mini response for judging scripts
 */
export function createJudgingResponse(judging: {
  winner: string;
  reasoning: string;
  scores: Array<{ persona: string; score: number; reasoning: string }>;
}): ChatCompletionResponse {
  return {
    id: `chatcmpl-${Math.random().toString(36).substring(7)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-4o-mini-2024-07-18',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify(judging),
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 600,
      completion_tokens: 250,
      total_tokens: 850,
    },
  };
}

/**
 * Create a mock embedding response
 */
export function createEmbeddingResponse(
  texts: string[],
  dimensions: number = 1536
): EmbeddingResponse {
  return {
    object: 'list',
    data: texts.map((_, index) => ({
      object: 'embedding',
      embedding: Array.from({ length: dimensions }, () => Math.random() * 2 - 1),
      index,
    })),
    model: 'text-embedding-3-small',
    usage: {
      prompt_tokens: texts.join(' ').split(' ').length,
      total_tokens: texts.join(' ').split(' ').length,
    },
  };
}

/**
 * Create a mock error response
 */
export function createOpenAIErrorResponse(
  code: string,
  message: string,
  status: number = 500
): Response {
  return new Response(
    JSON.stringify({
      error: {
        message,
        type: 'api_error',
        code,
      },
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

// ============================================================================
// Fixture Data
// ============================================================================

/**
 * Pre-built viral moments for testing
 */
export const VIRAL_MOMENT_FIXTURES = [
  {
    quote: "Mr Speaker, I think the Minister is trying to have his cake and eat it too.",
    speaker: "Leader of Opposition",
    why_viral: "Classic political idiom used in confrontational context, relatable metaphor about hypocrisy",
    ai_score: 8.5,
    topic: "Budget Debate",
    emotional_tone: "confrontational, witty",
    target_demographic: "politically engaged millennials",
    contains_jargon: false,
    has_contradiction: true,
    affects_everyday_life: true,
    segment_indices: [42],
  },
  {
    quote: "We cannot continue to kick the can down the road on climate action.",
    speaker: "Minister for Sustainability",
    why_viral: "Urgent climate message with vivid metaphor, appeals to environmental consciousness",
    ai_score: 7.8,
    topic: "Climate Change",
    emotional_tone: "urgent, concerned",
    target_demographic: "gen z climate activists",
    contains_jargon: false,
    has_contradiction: false,
    affects_everyday_life: true,
    segment_indices: [15, 16],
  },
];

/**
 * Pre-built scripts for testing
 */
export const SCRIPT_FIXTURES = {
  gen_z: {
    persona: "gen_z",
    script: "Bruh, this Minister really said 'have his cake and eat it too' in Parliament. The shade is REAL. Opposition leader came through with the facts, no cap. Budget debate getting spicy 🔥",
    reasoning: "Uses Gen Z slang (bruh, no cap), emojis, and captures confrontational energy",
  },
  kopitiam_uncle: {
    persona: "kopitiam_uncle",
    script: "Wah lau eh, you see this Minister or not? Want to eat cake also want to keep cake. Opposition leader very clever lah, catch him red-handed. Like that how to trust the budget?",
    reasoning: "Singlish expressions, kopitiam uncle tone, practical skepticism",
  },
  auntie: {
    persona: "auntie",
    script: "Aiyoh, this Minister ah, very greedy leh. Want everything also must have. The Opposition leader right lah, cannot like that. Budget must be fair, not only benefit some people.",
    reasoning: "Auntie expressions (aiyoh, leh), concern for fairness, practical wisdom",
  },
  attenborough: {
    persona: "attenborough",
    script: "Here, in the halls of Parliament, we observe a fascinating display of political theater. The Opposition leader, with surgical precision, exposes what he perceives as governmental hypocrisy.",
    reasoning: "Documentary narration style, David Attenborough-esque observational tone",
  },
};

/**
 * Pre-built judging results
 */
export const JUDGING_FIXTURE = {
  winner: "gen_z",
  reasoning: "Gen Z version has highest viral potential with authentic slang usage, emoji deployment, and captures confrontational energy that resonates on TikTok",
  scores: [
    { persona: "gen_z", score: 9.2, reasoning: "Perfect TikTok format, authentic voice, high engagement potential" },
    { persona: "kopitiam_uncle", score: 7.8, reasoning: "Strong local appeal but limited international reach" },
    { persona: "auntie", score: 7.5, reasoning: "Relatable but less shareable than Gen Z version" },
    { persona: "attenborough", score: 6.9, reasoning: "Entertaining but may be too niche for viral spread" },
  ],
};
