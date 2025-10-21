/**
 * Integration Test Specification: Asset Generator Worker
 *
 * Purpose: Define exact behavior for TDD development
 * Status: Specification (worker not built yet)
 *
 * Test Coverage:
 * - Script generation for 4 personas (Voice DNA validation)
 * - Audio generation via ElevenLabs
 * - Thumbnail generation
 * - Judge LLM selection
 * - Complete asset package pipeline
 * - Error handling & edge cases
 */

import { describe, it, expect, beforeAll } from 'vitest';

const WORKER_URL = 'http://localhost:8787'; // Dev server
const TEST_MOMENT = {
  moment_id: 'test_moment_123',
  quote: 'These are consequences of what I would describe as a knot that insurers and policyholders find themselves caught in.',
  speaker: 'Ms Rahayu Mahzam',
  topic: 'Healthcare Insurance',
  context: 'Discussion on rising Integrated Shield Plan premiums'
};

describe('Asset Generator Worker - Script Generation', () => {
  it('should generate 4 persona scripts from moment', async () => {
    const response = await fetch(`${WORKER_URL}/api/assets/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moment_id: TEST_MOMENT.moment_id,
        personas: ['gen_z', 'kopitiam_uncle', 'auntie', 'attenborough'],
        platform: 'tiktok'
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should return 4 scripts
    expect(data.scripts).toHaveLength(4);
    expect(data.moment_id).toBe(TEST_MOMENT.moment_id);

    // Validate structure of each script
    data.scripts.forEach((script: any) => {
      expect(script).toMatchObject({
        persona: expect.any(String),
        script: expect.any(String),
        word_count: expect.any(Number),
        estimated_duration: expect.any(Number),
        persona_score: expect.any(Number)
      });

      // Word count should be 100-150 (30-45 seconds when spoken)
      expect(script.word_count).toBeGreaterThanOrEqual(80);
      expect(script.word_count).toBeLessThanOrEqual(170);

      // Estimated duration should be 25-50 seconds
      expect(script.estimated_duration).toBeGreaterThanOrEqual(25);
      expect(script.estimated_duration).toBeLessThanOrEqual(50);
    });
  });

  it('should validate Voice DNA for Gen Z persona', async () => {
    const response = await fetch(`${WORKER_URL}/api/assets/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moment_id: TEST_MOMENT.moment_id,
        personas: ['gen_z'],
        platform: 'tiktok'
      })
    });

    const data = await response.json();
    const genZScript = data.scripts[0].script.toLowerCase();

    // Voice DNA markers for Gen Z (at least 2 should appear)
    const genZMarkers = [
      'bestie', 'it\'s giving', 'i can\'t', 'the way',
      'make it make sense', 'tell me', 'not the', 'literally'
    ];

    const markerCount = genZMarkers.filter(marker =>
      genZScript.includes(marker)
    ).length;

    expect(markerCount).toBeGreaterThanOrEqual(2);

    // Should contain emojis
    expect(genZScript).toMatch(/💀|🤯|✨|😤|🙄/);
  });

  it('should validate Voice DNA for Kopitiam Uncle persona', async () => {
    const response = await fetch(`${WORKER_URL}/api/assets/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moment_id: TEST_MOMENT.moment_id,
        personas: ['kopitiam_uncle'],
        platform: 'tiktok'
      })
    });

    const data = await response.json();
    const uncleScript = data.scripts[0].script.toLowerCase();

    // Voice DNA markers for Kopitiam Uncle (at least 3 should appear)
    const uncleMarkers = [
      'lah', 'leh', 'lor', 'wah lau', 'aiyah',
      'liddat', 'can ah', 'how to', 'so nice'
    ];

    const markerCount = uncleMarkers.filter(marker =>
      uncleScript.includes(marker)
    ).length;

    expect(markerCount).toBeGreaterThanOrEqual(3);
  });

  it('should validate Voice DNA for Anxious Auntie persona', async () => {
    const response = await fetch(`${WORKER_URL}/api/assets/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moment_id: TEST_MOMENT.moment_id,
        personas: ['auntie'],
        platform: 'tiktok'
      })
    });

    const data = await response.json();
    const auntieScript = data.scripts[0].script;

    // Voice DNA markers for Anxious Auntie
    const auntieMarkers = [
      'aiyoh', 'how?', 'then how', 'so stress',
      'cannot like that', 'my family', 'must plan'
    ];

    const markerCount = auntieMarkers.filter(marker =>
      auntieScript.toLowerCase().includes(marker)
    ).length;

    expect(markerCount).toBeGreaterThanOrEqual(2);

    // Should have multiple question marks (worried questioning)
    const questionMarkCount = (auntieScript.match(/\?/g) || []).length;
    expect(questionMarkCount).toBeGreaterThanOrEqual(3);
  });

  it('should validate Voice DNA for Attenborough persona', async () => {
    const response = await fetch(`${WORKER_URL}/api/assets/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moment_id: TEST_MOMENT.moment_id,
        personas: ['attenborough'],
        platform: 'tiktok'
      })
    });

    const data = await response.json();
    const attenboroughScript = data.scripts[0].script.toLowerCase();

    // Voice DNA markers for Attenborough
    const attenboroughMarkers = [
      'here', 'observe', 'in nature', 'curious',
      'remarkable', 'behavior', 'chamber'
    ];

    const markerCount = attenboroughMarkers.filter(marker =>
      attenboroughScript.includes(marker)
    ).length;

    expect(markerCount).toBeGreaterThanOrEqual(2);

    // Should be more measured (fewer exclamation marks)
    const exclamationCount = (data.scripts[0].script.match(/!/g) || []).length;
    expect(exclamationCount).toBeLessThanOrEqual(2);
  });

  it('should reject invalid persona names', async () => {
    const response = await fetch(`${WORKER_URL}/api/assets/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moment_id: TEST_MOMENT.moment_id,
        personas: ['invalid_persona'],
        platform: 'tiktok'
      })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid persona');
  });

  it('should handle missing moment_id', async () => {
    const response = await fetch(`${WORKER_URL}/api/assets/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personas: ['gen_z'],
        platform: 'tiktok'
      })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('moment_id');
  });
});

describe('Asset Generator Worker - Audio Generation', () => {
  it('should generate TTS audio for script', async () => {
    const response = await fetch(`${WORKER_URL}/api/assets/audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script: 'Okay so the Minister just explained why your insurance is expensive and it\'s giving quantum physics.',
        persona: 'gen_z',
        speed: 1.2
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should return audio URL
    expect(data.audio_url).toMatch(/^https:\/\/.+\.mp3$/);

    // Should return duration
    expect(data.duration).toBeGreaterThan(0);

    // Should return voice ID
    expect(data.voice_id).toBeTruthy();
  });

  it('should use correct voice for each persona', async () => {
    const personas = ['gen_z', 'kopitiam_uncle', 'auntie', 'attenborough'];

    for (const persona of personas) {
      const response = await fetch(`${WORKER_URL}/api/assets/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: 'Test script for voice validation',
          persona,
          speed: 1.0
        })
      });

      const data = await response.json();

      // Each persona should have unique voice_id
      expect(data.voice_id).toBeTruthy();
      expect(data.voice_id).toMatch(/^voice_/);
    }
  });

  it('should support speed adjustment', async () => {
    const speeds = [0.8, 1.0, 1.2, 1.5];
    const durations: number[] = [];

    for (const speed of speeds) {
      const response = await fetch(`${WORKER_URL}/api/assets/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: 'This is a test script for speed validation',
          persona: 'gen_z',
          speed
        })
      });

      const data = await response.json();
      durations.push(data.duration);
    }

    // Faster speeds should produce shorter durations
    expect(durations[0]).toBeGreaterThan(durations[1]); // 0.8x > 1.0x
    expect(durations[1]).toBeGreaterThan(durations[2]); // 1.0x > 1.2x
    expect(durations[2]).toBeGreaterThan(durations[3]); // 1.2x > 1.5x
  });

  it('should store audio in R2 bucket', async () => {
    const response = await fetch(`${WORKER_URL}/api/assets/audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script: 'Test script for storage validation',
        persona: 'gen_z'
      })
    });

    const data = await response.json();

    // Audio URL should point to R2 bucket
    expect(data.audio_url).toMatch(/\.r2\.dev\/audio\//);

    // Should be accessible
    const audioResponse = await fetch(data.audio_url);
    expect(audioResponse.ok).toBe(true);
    expect(audioResponse.headers.get('content-type')).toBe('audio/mpeg');
  });
});

describe('Asset Generator Worker - Thumbnail Generation', () => {
  it('should generate thumbnail with persona branding', async () => {
    const response = await fetch(`${WORKER_URL}/api/assets/thumbnail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moment_id: TEST_MOMENT.moment_id,
        persona: 'gen_z',
        template: 'default'
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should return thumbnail URL
    expect(data.thumbnail_url).toMatch(/^https:\/\/.+\.png$/);

    // Should return dimensions
    expect(data.dimensions).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number)
    });

    // Should be 9:16 aspect ratio (TikTok format)
    const aspectRatio = data.dimensions.width / data.dimensions.height;
    expect(aspectRatio).toBeCloseTo(9/16, 2);
  });

  it('should store thumbnail in R2 bucket', async () => {
    const response = await fetch(`${WORKER_URL}/api/assets/thumbnail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moment_id: TEST_MOMENT.moment_id,
        persona: 'kopitiam_uncle'
      })
    });

    const data = await response.json();

    // Thumbnail URL should point to R2 bucket
    expect(data.thumbnail_url).toMatch(/\.r2\.dev\/thumbnails\//);

    // Should be accessible
    const thumbnailResponse = await fetch(data.thumbnail_url);
    expect(thumbnailResponse.ok).toBe(true);
    expect(thumbnailResponse.headers.get('content-type')).toBe('image/png');
  });
});

describe('Asset Generator Worker - Complete Pipeline', () => {
  it('should return complete asset package', async () => {
    const response = await fetch(`${WORKER_URL}/api/assets/full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moment_id: TEST_MOMENT.moment_id,
        platform: 'tiktok',
        auto_select: true
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should have complete asset package
    expect(data).toMatchObject({
      script: {
        persona: expect.any(String),
        text: expect.any(String),
        duration: expect.any(Number)
      },
      audio_url: expect.stringMatching(/^https:\/\/.+\.mp3$/),
      thumbnail_url: expect.stringMatching(/^https:\/\/.+\.png$/),
      all_scripts: expect.arrayContaining([
        expect.objectContaining({
          persona: expect.any(String),
          script: expect.any(String),
          judge_score: expect.any(Number)
        })
      ]),
      metadata: expect.objectContaining({
        winner_reason: expect.any(String),
        judging_scores: expect.any(Array)
      })
    });

    // All 4 scripts should be included
    expect(data.all_scripts).toHaveLength(4);

    // Winner should have highest judge score
    const winnerScore = data.all_scripts.find(
      (s: any) => s.persona === data.script.persona
    )?.judge_score;

    const allScores = data.all_scripts.map((s: any) => s.judge_score);
    expect(winnerScore).toBe(Math.max(...allScores));
  });

  it('should allow manual persona selection', async () => {
    const response = await fetch(`${WORKER_URL}/api/assets/full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moment_id: TEST_MOMENT.moment_id,
        platform: 'tiktok',
        selected_persona: 'kopitiam_uncle'
      })
    });

    const data = await response.json();

    // Selected persona should be used
    expect(data.script.persona).toBe('kopitiam_uncle');

    // Audio should match selected persona
    expect(data.audio_url).toMatch(/kopitiam_uncle/);
  });

  it('should handle errors gracefully', async () => {
    const response = await fetch(`${WORKER_URL}/api/assets/full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moment_id: 'nonexistent_moment',
        platform: 'tiktok'
      })
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('Moment not found');
  });

  it('should complete pipeline in under 30 seconds', async () => {
    const startTime = Date.now();

    const response = await fetch(`${WORKER_URL}/api/assets/full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moment_id: TEST_MOMENT.moment_id,
        platform: 'tiktok'
      })
    });

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    expect(response.status).toBe(200);
    expect(duration).toBeLessThan(30); // Should complete in under 30 seconds
  });
});

describe('Asset Generator Worker - Judge LLM', () => {
  it('should provide reasoning for selected script', async () => {
    const response = await fetch(`${WORKER_URL}/api/assets/full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moment_id: TEST_MOMENT.moment_id,
        platform: 'tiktok'
      })
    });

    const data = await response.json();

    // Should explain why winner was chosen
    expect(data.metadata.winner_reason).toBeTruthy();
    expect(data.metadata.winner_reason.length).toBeGreaterThan(50);

    // Should include judging scores for all personas
    expect(data.metadata.judging_scores).toHaveLength(4);

    data.metadata.judging_scores.forEach((score: any) => {
      expect(score).toMatchObject({
        persona: expect.any(String),
        score: expect.any(Number),
        reasoning: expect.any(String)
      });
    });
  });

  it('should prefer persona appropriate for topic', async () => {
    // Healthcare topic should favor Anxious Auntie or Kopitiam Uncle
    const healthcareResponse = await fetch(`${WORKER_URL}/api/assets/full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moment_id: TEST_MOMENT.moment_id, // Healthcare topic
        platform: 'tiktok'
      })
    });

    const data = await healthcareResponse.json();

    // Winner should be appropriate for healthcare topic
    expect(['auntie', 'kopitiam_uncle']).toContain(data.script.persona);
  });
});

describe('Asset Generator Worker - Health Check', () => {
  it('should return healthy status', async () => {
    const response = await fetch(`${WORKER_URL}/health`);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toMatchObject({
      status: 'healthy',
      service: 'capless-asset-generator',
      timestamp: expect.any(String)
    });
  });

  it('should check external API availability', async () => {
    const response = await fetch(`${WORKER_URL}/health`);
    const data = await response.json();

    // Should report status of external APIs
    expect(data).toMatchObject({
      openai_available: expect.any(Boolean),
      elevenlabs_available: expect.any(Boolean),
      r2_available: expect.any(Boolean)
    });
  });
});
