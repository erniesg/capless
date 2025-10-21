# Tuning Guide - Virality Scoring

How to adjust the Moments Worker for better viral moment detection.

## Overview

The virality score is calculated using multiple factors. You can tune each component to match your content strategy.

## Current Scoring Formula

```typescript
final_score =
  (AI base score × 0.4) +           // 40% weight
  (jargon density × 2.0) +          // 20% weight (max 2 points)
  (contradiction ? 2.0 : 0) +       // +2 points bonus
  (quotability × 1.0) +             // +1 point max
  (everyday impact ? 1.5 : 0) +     // +1.5 points bonus
  (emotional intensity × 3.0)       // 30% weight (max 3 points)

// Final score capped at 10.0
```

## Tuning Strategies

### 1. Increase AI Influence

If you trust GPT-4o's judgment more than the algorithm:

**File:** `src/scorer.ts`

```typescript
// Original
score += analysis.ai_score * 0.4;  // 40% weight

// More AI influence
score += analysis.ai_score * 0.6;  // 60% weight

// Reduce other factors proportionally
score += jargonScore * 1.0;        // Was 2.0
score += emotionalScore * 2.0;     // Was 3.0
```

**Effect:** Moments will score closer to GPT-4o's assessment.

### 2. Emphasize Jargon Detection

For content focused on bureaucratic language:

**File:** `src/scorer.ts`

```typescript
// Add more jargon terms
const JARGON_TERMS = [
  // Existing terms
  'actuarial', 'framework', 'optimization',

  // Add Singapore-specific terms
  'recalibrate', 'calibration', 'modalities',
  'ecosystem', 'holistic', 'integrated',
  'robust', 'resilient', 'sustainable',
  'stakeholder', 'synergy', 'alignment',
];

// Increase jargon weight
score += jargonScore * 3.0;  // Was 2.0 (now 30% weight)
```

**Effect:** Jargon-heavy moments score higher.

### 3. Boost Contradiction Detection

For content highlighting logical inconsistencies:

**File:** `src/scorer.ts`

```typescript
// Add more contradiction patterns
const CONTRADICTION_PATTERNS = [
  { first: ['modest', 'small'], second: ['significantly', 'substantial'] },
  { first: ['affordable'], second: ['expensive', 'costly', 'rise'] },

  // Add new patterns
  { first: ['temporary'], second: ['permanent', 'long-term'] },
  { first: ['optional'], second: ['mandatory', 'required'] },
  { first: ['decrease', 'reduce'], second: ['increase', 'raise'] },
];

// Increase contradiction bonus
if (hasContradiction) {
  score += 3.0;  // Was 2.0
}
```

**Effect:** Contradictory statements get bigger boost.

### 4. Adjust Quotability Range

For different platforms:

**TikTok (shorter quotes):**

```typescript
calculateQuotabilityScore(text: string): number {
  const wordCount = text.split(/\s+/).length;

  // Optimal: 10-25 words (TikTok)
  if (wordCount >= 10 && wordCount <= 25) return 1.0;
  if (wordCount > 25 && wordCount <= 40) return 0.7;
  if (wordCount > 40) return 0.3;

  return 0.5;
}
```

**Instagram (medium quotes):**

```typescript
// Optimal: 15-40 words (current default)
if (wordCount >= 15 && wordCount <= 40) return 1.0;
```

**YouTube (longer quotes):**

```typescript
// Optimal: 20-60 words
if (wordCount >= 20 && wordCount <= 60) return 1.0;
if (wordCount > 60 && wordCount <= 100) return 0.8;
```

### 5. Tune Everyday Impact

Add more relevant topics:

**File:** `src/scorer.ts`

```typescript
const EVERYDAY_TOPICS = [
  // Existing
  'healthcare', 'housing', 'education',

  // Add Singapore-specific concerns
  'ns', 'national service', 'reservist',
  'gst', 'tax', 'taxes',
  'food', 'hawker', 'coffee shop',
  'grab', 'gojek', 'delivery',
  'netflix', 'streaming',
  'climate', 'heat', 'flooding',
];

// Increase everyday impact bonus
if (affectsEverydayLife) {
  score += 2.5;  // Was 1.5
}
```

### 6. Adjust Emotional Weighting

For more emotional content:

**File:** `src/scorer.ts`

```typescript
calculateEmotionalScore(tone: string): number {
  const lowerTone = tone.toLowerCase();

  // High emotion tones
  const highEmotion = [
    'angry', 'defensive', 'evasive', 'frustrated',
    'shocked', 'outraged', 'indignant'  // Add more
  ];

  // Increase emotional weight
  if (highEmotion.some(t => lowerTone.includes(t))) return 1.0;

  return 0.4;  // Neutral
}

// In calculateFinalScore
score += emotionalScore * 4.0;  // Was 3.0 (now 40% weight)
```

## Tuning the AI Prompt

The prompt significantly affects what moments are identified.

**File:** `src/extractor.ts`

### Make It More Aggressive

```typescript
generatePrompt(transcript: ProcessedTranscript): string {
  return `You are a viral content creator analyzing Singapore Parliament.

FIND THE MOST VIRAL MOMENTS - be aggressive!

Look for:
- MAXIMUM JARGON: The more bureaucratic nonsense, the better
- OBVIOUS CONTRADICTIONS: Logic fails, flip-flops
- TONE-DEAF STATEMENTS: Out of touch with regular Singaporeans
- DEFENSIVE BEHAVIOR: Ministers avoiding questions
- PURE GOLD SOUNDBITES: Things that make you go "WTF?!"

Score generously - we want 8-10 for truly viral stuff.
A 35% premium increase called "modest" = automatic 9+

Return JSON array...`;
}
```

### Make It More Conservative

```typescript
generatePrompt(transcript: ProcessedTranscript): string {
  return `You are a political analyst identifying noteworthy moments.

Find moments that are:
- Substantively interesting and newsworthy
- Representative of policy discourse
- Fairly quoted in context
- Accurate and verifiable

Be selective - only score 8-10 for truly exceptional moments.
Most moments should be 4-6 range.

Return JSON array...`;
}
```

### Target Specific Demographics

```typescript
// For Gen Z audience
Look for moments that:
- Use outdated or cringe language
- Show generational disconnect
- Relate to youth issues (education, jobs, housing)
- Have meme potential
- Work with TikTok trends

// For working class
Look for moments about:
- Cost of living and wages
- Transport and commuting
- Healthcare and insurance
- Job security
- Family finances
```

## Testing Your Tuning

After making changes, test with sample data:

```bash
# Run tests to ensure nothing broke
npm test

# Test with sample transcript
npm run dev

curl -X POST http://localhost:8788/api/moments/extract \
  -H "Content-Type: application/json" \
  -d '{
    "transcript_id": "transcript-2025-01-15-healthcare"
  }' | jq '.moments[] | {quote: .quote, score: .virality_score}'
```

Compare scores before and after tuning.

## Common Tuning Scenarios

### Scenario 1: Scores Too High

**Problem:** Everything scores 8-10, not useful.

**Solution:**
1. Reduce AI weight: `ai_score * 0.3`
2. Increase min_score threshold: `min_score: 7.0`
3. Make prompt more conservative
4. Reduce bonus points

### Scenario 2: Scores Too Low

**Problem:** Great moments scoring 4-5.

**Solution:**
1. Increase AI weight: `ai_score * 0.5`
2. Add more jargon terms
3. Increase bonus points
4. Make prompt more generous

### Scenario 3: Missing Good Moments

**Problem:** AI not identifying obvious viral content.

**Solution:**
1. Improve the prompt with specific examples
2. Add more contradiction patterns
3. Expand everyday topics list
4. Lower min_score threshold temporarily

### Scenario 4: Too Much Jargon Focus

**Problem:** Only jargon-heavy moments being selected.

**Solution:**
1. Reduce jargon weight: `jargonScore * 1.0`
2. Increase other factors
3. Add diversity to prompt

## A/B Testing Different Configurations

Track which configuration produces more engagement:

```typescript
// Version A: Jargon-focused
const WEIGHTS_A = {
  ai: 0.3,
  jargon: 3.0,
  contradiction: 2.0,
  quotability: 1.0,
  everyday: 1.5,
  emotion: 2.0,
};

// Version B: Emotion-focused
const WEIGHTS_B = {
  ai: 0.4,
  jargon: 1.5,
  contradiction: 2.0,
  quotability: 1.0,
  everyday: 2.0,
  emotion: 4.0,
};

// Version C: AI-trusting
const WEIGHTS_C = {
  ai: 0.7,
  jargon: 1.0,
  contradiction: 1.5,
  quotability: 0.5,
  everyday: 1.0,
  emotion: 1.5,
};
```

Measure:
- Click-through rate
- Share rate
- Watch time
- Completion rate

## Advanced Tuning

### Dynamic Scoring by Topic

```typescript
calculateFinalScore(analysis: AIAnalysis): number {
  let baseScore = this.calculateBaseScore(analysis);

  // Boost specific topics
  if (analysis.topic === 'Healthcare') {
    baseScore *= 1.2;  // Healthcare always more viral
  }
  if (analysis.topic === 'Housing') {
    baseScore *= 1.3;  // Housing even more viral
  }

  return Math.min(baseScore, 10.0);
}
```

### Time-Decay for Trending

```typescript
// Older moments decay in score
const daysSinceCreated = /* calculate */;
const decayFactor = Math.exp(-daysSinceCreated / 7);  // Half-life of 7 days
const trendingScore = baseScore * decayFactor;
```

### Demographic-Specific Scoring

```typescript
// Different weights for different audiences
const DEMOGRAPHIC_WEIGHTS = {
  'Gen Z': { jargon: 3.0, contradiction: 3.0 },
  'working class': { everyday: 3.0, emotion: 3.0 },
  'elderly': { healthcare: 3.0, cpf: 3.0 },
};
```

## Validation

After tuning, validate with real data:

1. **Manual Review**: Check top 20 moments, do they feel viral?
2. **Diversity**: Are you getting moments from different topics/speakers?
3. **Score Distribution**: Should be spread across 5-10, not all 9-10
4. **False Positives**: Are boring moments scoring high?
5. **False Negatives**: Are great moments scoring low?

## Recommended Starting Points

### Conservative (News-Like)

```typescript
ai_score * 0.5
jargon * 1.0
contradiction * 1.5
everyday * 2.0
emotion * 1.5
min_score: 6.0
```

### Aggressive (Viral-First)

```typescript
ai_score * 0.4
jargon * 3.0
contradiction * 3.0
everyday * 2.0
emotion * 4.0
min_score: 7.0
```

### Balanced (Default)

```typescript
ai_score * 0.4
jargon * 2.0
contradiction * 2.0
everyday * 1.5
emotion * 3.0
min_score: 5.0
```

## Iteration Process

1. Deploy with default settings
2. Collect 100+ moments
3. Manually review top 50
4. Identify patterns in misses/false positives
5. Adjust weights
6. Test with same data
7. Compare results
8. Repeat

## Monitoring

Track these metrics to guide tuning:

- **Average score**: Should be 6-7
- **Top 10% score**: Should be 8-10
- **Moments per transcript**: 3-8 is good
- **Topic diversity**: Don't over-index on one topic
- **Speaker diversity**: Balance MP vs Minister moments

Good luck tuning! 🎯
