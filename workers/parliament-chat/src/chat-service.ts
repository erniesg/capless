/**
 * Chat Service - RAG Implementation
 *
 * Implements Retrieval-Augmented Generation for parliamentary transcript Q&A:
 * 1. Embed user question
 * 2. Search vector database for relevant chunks
 * 3. Build context from retrieved chunks
 * 4. Generate answer with LLM + citations
 */

import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { Env, ChatResponse, Citation, VectorSearchResult } from './types';
import { generateEmbeddings } from './embedding-service';

/**
 * Search vector database for relevant chunks
 */
export async function vectorSearch(
  env: Env,
  question: string,
  sessionDate: string,
  topK: number = 5
): Promise<VectorSearchResult[]> {
  console.log(`[Chat] Searching for top ${topK} chunks for question: "${question}"`);

  // Generate embedding for question
  const { embeddings } = await generateEmbeddings(env, [question]);
  const questionEmbedding = embeddings[0];

  // Search Vectorize with metadata filter
  const results = await env.VECTORIZE.query(questionEmbedding, {
    topK,
    filter: {
      session_date: sessionDate,
    },
    returnMetadata: 'all',
  });

  console.log(`[Chat] Found ${results.matches.length} matching chunks`);

  // Convert to VectorSearchResult format
  const searchResults: VectorSearchResult[] = results.matches.map((match) => ({
    id: match.id,
    score: match.score,
    metadata: {
      text: match.metadata?.text as string || '',
      speaker: match.metadata?.speaker as string || undefined,
      session_date: match.metadata?.session_date as string || sessionDate,
      chunk_index: match.metadata?.chunk_index as number || 0,
      section_title: match.metadata?.section_title as string || undefined,
      subsection_title: match.metadata?.subsection_title as string || undefined,
      word_count: match.metadata?.word_count as number || 0,
    },
  }));

  return searchResults;
}

/**
 * Build context from search results
 */
function buildContext(results: VectorSearchResult[]): string {
  const contextParts = results.map((result, index) => {
    const speaker = result.metadata.speaker ? `[${result.metadata.speaker}]` : '[Unknown Speaker]';
    const section = result.metadata.section_title ? `\nSection: ${result.metadata.section_title}` : '';

    return `--- Source ${index + 1} (Confidence: ${(result.score * 100).toFixed(1)}%) ---
${speaker}${section}
${result.metadata.text}
`;
  });

  return contextParts.join('\n');
}

/**
 * Generate answer using LLM with RAG context
 */
export async function generateAnswer(
  env: Env,
  question: string,
  context: string,
  sessionDate: string
): Promise<{ answer: string; model: string }> {
  console.log(`[Chat] Generating answer for question: "${question}"`);

  const systemPrompt = `You are a helpful assistant that answers questions about Singapore Parliamentary sessions.

You are provided with excerpts from the parliamentary transcript for session ${sessionDate}.

INSTRUCTIONS:
1. Answer the question based ONLY on the provided context
2. If the context doesn't contain enough information, say so clearly
3. Be concise and factual
4. Include relevant speaker names when available
5. DO NOT make up information or hallucinate facts
6. If multiple speakers discussed the topic, mention them
7. Use direct quotes when they strengthen your answer

CONTEXT FROM PARLIAMENTARY TRANSCRIPT:
${context}`;

  const userPrompt = `Question: ${question}

Please provide a clear, concise answer based on the parliamentary transcript context provided.`;

  try {
    // Try Anthropic Claude first (better at following instructions)
    if (env.ANTHROPIC_API_KEY) {
      const model = anthropic('claude-3-5-sonnet-20241022', {
        apiKey: env.ANTHROPIC_API_KEY, // Explicitly pass API key
      });

      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        maxTokens: 500,
        temperature: 0.3, // Lower temperature for factual responses
      });

      console.log(`[Chat] Generated answer with Claude (${result.usage.totalTokens} tokens)`);
      return { answer: result.text, model: 'claude-3-5-sonnet-20241022' };
    }

    // Fallback to OpenAI
    if (env.OPENAI_API_KEY) {
      const model = openai('gpt-4o-mini', {
        apiKey: env.OPENAI_API_KEY, // Explicitly pass API key
      });

      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        maxTokens: 500,
        temperature: 0.3,
      });

      console.log(`[Chat] Generated answer with GPT-4 (${result.usage.totalTokens} tokens)`);
      return { answer: result.text, model: 'gpt-4o-mini' };
    }

    throw new Error('No LLM provider available. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
  } catch (error) {
    console.error('[Chat] Error generating answer:', error);
    throw new Error(`Failed to generate answer: ${error}`);
  }
}

/**
 * Build citations from search results
 */
function buildCitations(results: VectorSearchResult[]): Citation[] {
  return results.map((result, index) => ({
    text: result.metadata.text.substring(0, 200) + '...', // Truncate for brevity
    speaker: result.metadata.speaker,
    timestamp: result.metadata.section_title,
    youtube_url: undefined, // TODO: Link to YouTube if timestamps available
    confidence: result.score,
    chunk_index: result.metadata.chunk_index,
  }));
}

/**
 * Main chat function - RAG pipeline
 */
export async function chat(
  env: Env,
  question: string,
  sessionDate: string,
  maxResults: number = 5
): Promise<ChatResponse> {
  console.log(`[Chat] Processing question for session ${sessionDate}: "${question}"`);

  // Step 1: Vector search for relevant chunks
  const searchResults = await vectorSearch(env, question, sessionDate, maxResults);

  if (searchResults.length === 0) {
    return {
      answer: `I couldn't find any relevant information in the ${sessionDate} parliamentary session transcript. The session may not be embedded yet, or your question may not be covered in this session.`,
      citations: [],
      session_date: sessionDate,
    };
  }

  // Step 2: Build context from search results
  const context = buildContext(searchResults);

  // Step 3: Generate answer with LLM
  const { answer, model } = await generateAnswer(env, question, context, sessionDate);

  // Step 4: Build citations
  const citations = buildCitations(searchResults);

  console.log(`[Chat] Successfully generated answer with ${citations.length} citations`);

  return {
    answer,
    citations,
    session_date: sessionDate,
    model_used: model,
  };
}

/**
 * Generate follow-up question suggestions based on context
 */
export async function suggestFollowUpQuestions(
  env: Env,
  question: string,
  answer: string,
  sessionDate: string
): Promise<string[]> {
  console.log(`[Chat] Generating follow-up questions`);

  const systemPrompt = `You are a helpful assistant that suggests relevant follow-up questions about Singapore Parliamentary sessions.

Given a user's question and the answer provided, suggest 3 relevant follow-up questions that would help the user explore the topic further.

The questions should be:
1. Specific to the ${sessionDate} parliamentary session
2. Related to the original question and answer
3. Answerable from the transcript context
4. Concise and clear`;

  const userPrompt = `Original Question: ${question}

Answer: ${answer}

Please suggest 3 relevant follow-up questions (one per line, no numbering):`;

  try {
    if (env.ANTHROPIC_API_KEY) {
      const model = anthropic('claude-3-5-sonnet-20241022');

      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        maxTokens: 200,
        temperature: 0.7,
      });

      const questions = result.text
        .split('\n')
        .filter(q => q.trim().length > 0)
        .map(q => q.replace(/^\d+\.\s*/, '').trim())
        .slice(0, 3);

      return questions;
    }

    return [];
  } catch (error) {
    console.warn('[Chat] Failed to generate follow-up questions:', error);
    return [];
  }
}
