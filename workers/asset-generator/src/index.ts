import {
  Env,
  ErrorResponse,
  ScriptRequest,
  ScriptRequestSchema,
  ScriptResponse,
  AudioRequest,
  AudioRequestSchema,
  AudioResponse,
  ThumbnailRequest,
  ThumbnailRequestSchema,
  ThumbnailResponse,
  FullAssetRequest,
  FullAssetRequestSchema,
  FullAssetResponse,
  HealthResponse,
  Persona,
} from './types';
import { ScriptGenerator } from './generators/script-generator';
import { JudgeLLM } from './generators/judge';
import { AudioGenerator } from './generators/audio-generator';
import { ThumbnailGenerator } from './generators/thumbnail-generator';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route requests
      if (url.pathname === '/health' && request.method === 'GET') {
        return handleHealth(env, corsHeaders);
      }

      if (url.pathname === '/api/assets/scripts' && request.method === 'POST') {
        return handleScripts(request, env, corsHeaders);
      }

      if (url.pathname === '/api/assets/audio' && request.method === 'POST') {
        return handleAudio(request, env, corsHeaders);
      }

      if (url.pathname === '/api/assets/thumbnail' && request.method === 'POST') {
        return handleThumbnail(request, env, corsHeaders);
      }

      if (url.pathname === '/api/assets/full' && request.method === 'POST') {
        return handleFullAssets(request, env, corsHeaders);
      }

      // 404 Not Found
      return jsonResponse(
        { error: 'Not found', details: `Path ${url.pathname} not found` },
        404,
        corsHeaders
      );
    } catch (error: any) {
      console.error('Error handling request:', error);
      return jsonResponse(
        {
          error: 'Internal server error',
          details: error.message,
        },
        500,
        corsHeaders
      );
    }
  },
};

/**
 * Health check endpoint
 */
async function handleHealth(
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const audioGen = new AudioGenerator(env);

  // Check external API availability
  const [elevenLabsAvailable, r2Available] = await Promise.all([
    audioGen.checkAvailability(),
    checkR2Availability(env),
  ]);

  // OpenAI availability check (simple validation)
  const openaiAvailable = !!env.OPENAI_API_KEY;

  const allHealthy = openaiAvailable && elevenLabsAvailable && r2Available;

  const health: HealthResponse = {
    status: allHealthy ? 'healthy' : 'degraded',
    service: 'capless-asset-generator',
    timestamp: new Date().toISOString(),
    openai_available: openaiAvailable,
    elevenlabs_available: elevenLabsAvailable,
    r2_available: r2Available,
  };

  return jsonResponse(health, allHealthy ? 200 : 503, corsHeaders);
}

/**
 * Generate scripts for all personas
 */
async function handleScripts(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await request.json();
    const validated = ScriptRequestSchema.parse(body);

    const generator = new ScriptGenerator(env);
    const startTime = Date.now();

    const scripts = await generator.generateAllScripts(
      validated.moment_id,
      validated.personas,
      validated.platform
    );

    const generationTime = Date.now() - startTime;

    const response: ScriptResponse = {
      moment_id: validated.moment_id,
      scripts,
      generation_metadata: {
        model: env.OPENAI_MODEL,
        generation_time_ms: generationTime,
      },
    };

    return jsonResponse(response, 200, corsHeaders);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return jsonResponse(
        {
          error: 'Invalid request',
          details: error.errors.map((e: any) => e.message).join(', '),
        },
        400,
        corsHeaders
      );
    }

    if (error.message.includes('Moment not found')) {
      return jsonResponse(
        { error: 'Moment not found', details: error.message },
        404,
        corsHeaders
      );
    }

    if (error.message.includes('Invalid persona')) {
      return jsonResponse(
        { error: 'Invalid persona', details: error.message },
        400,
        corsHeaders
      );
    }

    throw error;
  }
}

/**
 * Generate TTS audio for script
 */
async function handleAudio(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await request.json();
    const validated = AudioRequestSchema.parse(body);

    const generator = new AudioGenerator(env);

    const result = await generator.generateAudio(
      validated.script,
      validated.persona,
      validated.speed
    );

    const response: AudioResponse = {
      audio_url: result.audio_url,
      duration: result.duration,
      voice_id: result.voice_id,
    };

    return jsonResponse(response, 200, corsHeaders);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return jsonResponse(
        {
          error: 'Invalid request',
          details: error.errors.map((e: any) => e.message).join(', '),
        },
        400,
        corsHeaders
      );
    }

    throw error;
  }
}

/**
 * Generate thumbnail
 */
async function handleThumbnail(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await request.json();
    const validated = ThumbnailRequestSchema.parse(body);

    const scriptGen = new ScriptGenerator(env);
    const thumbnailGen = new ThumbnailGenerator(env);

    // Fetch moment
    const moment = await scriptGen.getMoment(validated.moment_id);

    const result = await thumbnailGen.generateThumbnail(
      moment,
      validated.persona,
      validated.template
    );

    const response: ThumbnailResponse = {
      thumbnail_url: result.thumbnail_url,
      dimensions: result.dimensions,
    };

    return jsonResponse(response, 200, corsHeaders);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return jsonResponse(
        {
          error: 'Invalid request',
          details: error.errors.map((e: any) => e.message).join(', '),
        },
        400,
        corsHeaders
      );
    }

    if (error.message.includes('Moment not found')) {
      return jsonResponse(
        { error: 'Moment not found', details: error.message },
        404,
        corsHeaders
      );
    }

    throw error;
  }
}

/**
 * Generate complete asset package (scripts + judge + audio + thumbnail)
 */
async function handleFullAssets(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await request.json();
    const validated = FullAssetRequestSchema.parse(body);

    const scriptGen = new ScriptGenerator(env);
    const judge = new JudgeLLM(env);
    const audioGen = new AudioGenerator(env);
    const thumbnailGen = new ThumbnailGenerator(env);

    // Step 1: Fetch moment
    const moment = await scriptGen.getMoment(validated.moment_id);

    // Step 2: Generate all 4 persona scripts
    const allPersonas: Persona[] = ['gen_z', 'kopitiam_uncle', 'auntie', 'attenborough'];
    const scripts = await scriptGen.generateAllScripts(
      validated.moment_id,
      allPersonas,
      validated.platform
    );

    // Step 3: Judge scripts to select winner (or use manual selection)
    let winnerPersona: Persona;
    let winnerReason: string;
    let judgingScores;

    if (validated.selected_persona) {
      // Manual selection
      winnerPersona = validated.selected_persona;
      winnerReason = 'Manually selected by user';
      judgingScores = scripts.map(s => ({
        persona: s.persona,
        score: s.persona === winnerPersona ? 10 : 0,
        reasoning: s.persona === winnerPersona ? 'User selected' : 'Not selected',
      }));
    } else if (validated.auto_select) {
      // AI judge selection
      const judgeResult = await judge.judgeScripts(scripts, moment);
      winnerPersona = judgeResult.winner;
      winnerReason = judgeResult.winner_reason;
      judgingScores = judgeResult.judging_scores;
    } else {
      // Fallback: topic-based selection
      winnerPersona = judge.selectPersonaForTopic(moment.topic, scripts);
      winnerReason = `Selected based on topic affinity: ${moment.topic}`;
      judgingScores = scripts.map(s => ({
        persona: s.persona,
        score: s.persona === winnerPersona ? 8 : 5,
        reasoning: s.persona === winnerPersona ? 'Best fit for topic' : 'Alternative option',
      }));
    }

    const winnerScript = scripts.find(s => s.persona === winnerPersona);
    if (!winnerScript) {
      throw new Error(`Winner persona not found: ${winnerPersona}`);
    }

    // Step 4: Generate audio for winner (in parallel with thumbnail)
    const [audioResult, thumbnailResult] = await Promise.all([
      audioGen.generateAudio(winnerScript.script, winnerPersona, 1.0),
      thumbnailGen.generateThumbnail(moment, winnerPersona, 'default'),
    ]);

    // Step 5: Build full response
    const response: FullAssetResponse = {
      script: {
        persona: winnerPersona,
        text: winnerScript.script,
        duration: winnerScript.estimated_duration,
      },
      audio_url: audioResult.audio_url,
      thumbnail_url: thumbnailResult.thumbnail_url,
      all_scripts: scripts.map(s => ({
        persona: s.persona,
        script: s.script,
        judge_score: judgingScores.find(js => js.persona === s.persona)?.score || 0,
      })),
      metadata: {
        winner_reason: winnerReason,
        judging_scores: judgingScores,
      },
    };

    return jsonResponse(response, 200, corsHeaders);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return jsonResponse(
        {
          error: 'Invalid request',
          details: error.errors.map((e: any) => e.message).join(', '),
        },
        400,
        corsHeaders
      );
    }

    if (error.message.includes('Moment not found')) {
      return jsonResponse(
        { error: 'Moment not found', details: error.message },
        404,
        corsHeaders
      );
    }

    throw error;
  }
}

/**
 * Check R2 availability
 */
async function checkR2Availability(env: Env): Promise<boolean> {
  try {
    // Try to list objects (lightweight operation)
    await env.R2.list({ limit: 1 });
    return true;
  } catch (error) {
    console.error('R2 availability check failed:', error);
    return false;
  }
}

/**
 * Helper: JSON response with CORS
 */
function jsonResponse(
  data: any,
  status: number,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}
