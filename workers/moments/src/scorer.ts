import type { AIAnalysis, ViralMoment } from './types';

/**
 * Jargon terms commonly used in Singapore Parliament
 */
const JARGON_TERMS = [
  'actuarial',
  'framework',
  'optimization',
  'mechanism',
  'comprehensive',
  'enhancement',
  'sustainability',
  'inter-generational',
  'risk-pooling',
  'ecosystem',
  'synergy',
  'paradigm',
  'holistic',
  'leveraging',
  'stakeholder',
  'modalities',
  'calibration',
  'recalibration',
];

/**
 * Contradiction indicators
 */
const CONTRADICTION_PATTERNS = [
  { first: ['modest', 'small', 'minor'], second: ['significantly', 'substantially', 'major'] },
  { first: ['affordable', 'cheap'], second: ['expensive', 'costly', 'rise', 'increase'] },
  { first: ['simple', 'straightforward'], second: ['complex', 'complicated'] },
  { first: ['will', 'definitely'], second: ['might', 'maybe', 'possibly'] },
];

/**
 * Topics that affect everyday Singaporeans
 */
const EVERYDAY_TOPICS = [
  'healthcare',
  'health',
  'insurance',
  'housing',
  'hdb',
  'education',
  'school',
  'transport',
  'mrt',
  'bus',
  'taxi',
  'cost of living',
  'prices',
  'wages',
  'salary',
  'jobs',
  'employment',
  'cpf',
  'retirement',
  'childcare',
  'elderly care',
];

/**
 * ViralityScorer calculates the final virality score for moments
 */
export class ViralityScorer {
  /**
   * Calculate jargon density score (0-1)
   */
  calculateJargonScore(text: string): number {
    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\s+/);
    const jargonCount = JARGON_TERMS.filter(term => lowerText.includes(term)).length;

    // Score based on jargon density
    const density = jargonCount / Math.max(words.length / 10, 1);
    return Math.min(density, 1.0);
  }

  /**
   * Detect contradictions in text
   */
  detectContradiction(text: string): boolean {
    const lowerText = text.toLowerCase();

    return CONTRADICTION_PATTERNS.some(pattern => {
      const hasFirst = pattern.first.some(word => lowerText.includes(word));
      const hasSecond = pattern.second.some(word => lowerText.includes(word));
      return hasFirst && hasSecond;
    });
  }

  /**
   * Check if topic affects everyday life
   */
  affectsEverydayLife(topic: string): boolean {
    const lowerTopic = topic.toLowerCase();
    return EVERYDAY_TOPICS.some(everyday => lowerTopic.includes(everyday));
  }

  /**
   * Calculate quotability score based on word count (0-1)
   * Optimal range: 15-40 words
   */
  calculateQuotabilityScore(text: string): number {
    const wordCount = text.split(/\s+/).length;

    if (wordCount < 10) return 0.3;
    if (wordCount >= 15 && wordCount <= 40) return 1.0;
    if (wordCount > 40 && wordCount <= 60) return 0.7;
    if (wordCount > 60) return 0.4;

    // Between 10-15
    return 0.6 + ((wordCount - 10) / 5) * 0.4;
  }

  /**
   * Calculate emotional intensity score (0-1)
   * Based on emotional tone keywords
   */
  calculateEmotionalScore(tone: string): number {
    const highEmotionTones = ['angry', 'defensive', 'evasive', 'frustrated', 'shocked'];
    const mediumEmotionTones = ['concerned', 'worried', 'confused', 'skeptical'];

    const lowerTone = tone.toLowerCase();

    if (highEmotionTones.some(t => lowerTone.includes(t))) return 1.0;
    if (mediumEmotionTones.some(t => lowerTone.includes(t))) return 0.6;

    return 0.3; // Neutral
  }

  /**
   * Calculate final virality score (0-10)
   *
   * Algorithm:
   * - AI base score: 40% weight
   * - Jargon density: 20% weight
   * - Contradiction: +2 points
   * - Quotability: +1 point
   * - Everyday impact: +1.5 points
   * - Emotional intensity: 30% weight
   */
  calculateFinalScore(analysis: AIAnalysis): number {
    let score = 0;

    // AI-generated base score (40% weight)
    score += analysis.ai_score * 0.4;

    // Jargon density (20% weight, scaled to 2 points max)
    const jargonScore = this.calculateJargonScore(analysis.quote);
    score += jargonScore * 2.0;

    // Contradiction detection (+2 points)
    if (analysis.has_contradiction || this.detectContradiction(analysis.quote)) {
      score += 2.0;
    }

    // Quotability (scaled to 1 point max)
    const quotabilityScore = this.calculateQuotabilityScore(analysis.quote);
    score += quotabilityScore * 1.0;

    // Everyday impact (+1.5 points)
    if (analysis.affects_everyday_life || this.affectsEverydayLife(analysis.topic)) {
      score += 1.5;
    }

    // Emotional intensity (30% weight, scaled to 3 points max)
    const emotionalScore = this.calculateEmotionalScore(analysis.emotional_tone);
    score += emotionalScore * 3.0;

    // Cap at 10
    return Math.min(score, 10.0);
  }

  /**
   * Adjust score based on specific criteria
   */
  adjustScore(baseScore: number, moment: Partial<ViralMoment>): number {
    let adjusted = baseScore;

    // Boost for specific target demographics
    if (moment.target_demographic?.includes('Gen Z')) {
      adjusted += 0.5;
    }

    // Reduce score for overly long quotes
    if (moment.quote && moment.quote.length > 250) {
      adjusted -= 1.0;
    }

    return Math.max(0, Math.min(adjusted, 10.0));
  }
}
