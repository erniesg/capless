import OpenAI from 'openai';
import { Env, Persona, PersonaScript, JudgingScore, Moment } from '../types';

export class JudgeLLM {
  private openai: OpenAI;
  private env: Env;

  constructor(env: Env) {
    this.env = env;
    this.openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  /**
   * Judge all scripts and select the winner based on virality potential,
   * authenticity, and topic appropriateness
   */
  async judgeScripts(
    scripts: PersonaScript[],
    moment: Moment
  ): Promise<{
    winner: Persona;
    winner_reason: string;
    judging_scores: JudgingScore[];
  }> {
    const judgePrompt = `You are an expert judge for viral political content on social media. Evaluate these 4 scripts and select the winner.

PARLIAMENTARY MOMENT:
Quote: "${moment.quote}"
Speaker: ${moment.speaker}
Topic: ${moment.topic}
Context: ${moment.context}

SCRIPTS TO JUDGE:

${scripts.map((s, i) => `
${i + 1}. ${s.persona.toUpperCase()} (${s.word_count} words, ~${s.estimated_duration}s)
${s.script}
`).join('\n')}

JUDGING CRITERIA:
1. Virality Potential (0-10): How likely is this to go viral?
2. Authenticity (0-10): Does it sound genuinely like the persona, not performative?
3. Topic Appropriateness (0-10): Is this persona well-suited for this topic?
4. Engagement (0-10): Will it drive comments, shares, reactions?
5. Voice DNA Adherence (0-10): Does it authentically embody the persona's cognitive and emotional architecture?

For each script, provide:
- A score (0-10, can use decimals)
- Brief reasoning (2-3 sentences)

Then select the overall winner and explain why in 3-4 sentences.

Respond in JSON format:
{
  "scores": [
    {
      "persona": "gen_z",
      "score": 8.5,
      "reasoning": "..."
    },
    ...
  ],
  "winner": "gen_z",
  "winner_reason": "..."
}`;

    const completion = await this.openai.chat.completions.create({
      model: this.env.OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert judge for viral social media content. You understand what makes political content engaging, shareable, and authentic. You respond only in valid JSON format.',
        },
        {
          role: 'user',
          content: judgePrompt,
        },
      ],
      temperature: 0.3, // Lower for more consistent judging
      response_format: { type: 'json_object' },
    });

    const response = completion.choices[0]?.message?.content || '{}';
    const judgeResult = JSON.parse(response);

    // Validate and extract judging results
    const judgingScores: JudgingScore[] = judgeResult.scores.map((s: any) => ({
      persona: s.persona,
      score: s.score,
      reasoning: s.reasoning,
    }));

    return {
      winner: judgeResult.winner,
      winner_reason: judgeResult.winner_reason,
      judging_scores: judgingScores,
    };
  }

  /**
   * Simple topic-based persona selection (fallback if judge fails)
   */
  selectPersonaForTopic(topic: string, scripts: PersonaScript[]): Persona {
    const topicLower = topic.toLowerCase();

    // Topic-persona affinity rules
    if (
      topicLower.includes('health') ||
      topicLower.includes('insurance') ||
      topicLower.includes('medical')
    ) {
      // Healthcare topics favor Anxious Auntie or Kopitiam Uncle
      return this.findBestByScore(scripts, ['auntie', 'kopitiam_uncle']);
    }

    if (
      topicLower.includes('housing') ||
      topicLower.includes('cost') ||
      topicLower.includes('price')
    ) {
      // Economic topics favor Kopitiam Uncle or Anxious Auntie
      return this.findBestByScore(scripts, ['kopitiam_uncle', 'auntie']);
    }

    if (
      topicLower.includes('education') ||
      topicLower.includes('young') ||
      topicLower.includes('jobs')
    ) {
      // Youth-related topics favor Gen Z
      return this.findBestByScore(scripts, ['gen_z']);
    }

    if (
      topicLower.includes('policy') ||
      topicLower.includes('complex') ||
      topicLower.includes('system')
    ) {
      // Complex policy topics favor Attenborough
      return this.findBestByScore(scripts, ['attenborough']);
    }

    // Default: highest persona score
    const sorted = [...scripts].sort((a, b) => b.persona_score - a.persona_score);
    return sorted[0].persona;
  }

  /**
   * Find the best script among preferred personas
   */
  private findBestByScore(scripts: PersonaScript[], preferred: Persona[]): Persona {
    const preferredScripts = scripts.filter(s => preferred.includes(s.persona));

    if (preferredScripts.length === 0) {
      // Fallback to all scripts
      const sorted = [...scripts].sort((a, b) => b.persona_score - a.persona_score);
      return sorted[0].persona;
    }

    const sorted = [...preferredScripts].sort((a, b) => b.persona_score - a.persona_score);
    return sorted[0].persona;
  }
}
