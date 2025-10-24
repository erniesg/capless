import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  Env,
  VideoGenerationRequestSchema,
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoStatusResponse,
  VideoJob,
  Moment,
  Persona,
} from './types';
import { generateScript } from './script-generator';
import { VOICE_DNA_CONFIGS } from './voice-dna';
import { createSoraClient } from './sora-client';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes
app.use('*', cors());

/**
 * POST /api/video/generate
 * Generate a video from a parliament moment
 */
app.post('/api/video/generate', async (c) => {
  try {
    // Parse and validate request
    const body = await c.req.json();
    const validationResult = VideoGenerationRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return c.json(
        {
          error: 'Invalid request',
          details: validationResult.error.errors,
        },
        400
      );
    }

    const request: VideoGenerationRequest = validationResult.data;

    // Fetch moment from R2
    const moment = await fetchMomentFromR2(c.env.R2, request.moment_id);
    if (!moment) {
      return c.json(
        {
          error: 'Moment not found',
          moment_id: request.moment_id,
        },
        404
      );
    }

    // Generate job ID
    const jobId = `${request.moment_id}-${request.persona}-${Date.now()}`;

    // Determine final persona
    let selectedPersona: Persona = request.persona;
    let judgeReasoning: string | undefined;

    if (request.persona === 'ai_decide') {
      // Generate scripts for all personas and have AI judge
      const judgeResult = await judgePersona(moment, c.env);
      selectedPersona = judgeResult.persona;
      judgeReasoning = judgeResult.reasoning;
    }

    // Initialize job in KV
    const job: VideoJob = {
      job_id: jobId,
      status: 'processing',
      request,
      moment,
      selected_persona: selectedPersona,
      judge_reasoning: judgeReasoning,
      created_at: new Date().toISOString(),
    };

    await c.env.VIDEO_JOBS.put(jobId, JSON.stringify(job));

    // Start video generation asynchronously
    c.executionCtx.waitUntil(
      generateVideoAsync(jobId, moment, selectedPersona, c.env)
    );

    // Return immediate response
    const response: VideoGenerationResponse = {
      job_id: jobId,
      status: 'processing',
      estimated_time_seconds: 180, // Sora typically takes 2-3 minutes
      poll_url: `/api/video/status/${jobId}`,
    };

    return c.json(response, 202);
  } catch (error) {
    console.error('Error in /api/video/generate:', error);
    return c.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/video/status/:job_id
 * Check video generation status
 */
app.get('/api/video/status/:job_id', async (c) => {
  const jobId = c.req.param('job_id');

  try {
    const jobData = await c.env.VIDEO_JOBS.get(jobId);

    if (!jobData) {
      return c.json(
        {
          error: 'Job not found',
          job_id: jobId,
        },
        404
      );
    }

    const job: VideoJob = JSON.parse(jobData);

    // Add progress information based on status
    let progress: string | undefined;
    if (job.status === 'processing') {
      if (!job.scripts) {
        progress = 'Generating script...';
      } else if (!job.sora_generation_id) {
        progress = 'Submitting to Sora API...';
      } else {
        progress = 'Generating video (this may take 2-3 minutes)...';
      }
    }

    const response: VideoStatusResponse = {
      ...job,
      progress,
    };

    return c.json(response);
  } catch (error) {
    console.error('Error in /api/video/status:', error);
    return c.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * Root endpoint
 */
app.get('/', (c) => {
  return c.json({
    service: 'Capless Video Generator',
    endpoints: {
      generate: 'POST /api/video/generate - Generate video from parliament moment',
      status: 'GET /api/video/status/:jobId - Check video generation status',
      health: 'GET /health - Health check',
    },
    version: '1.0.0',
  });
});

/**
 * Health check endpoint
 */
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'video-generator' });
});

/**
 * Fetch moment from R2 bucket
 */
async function fetchMomentFromR2(
  r2: R2Bucket,
  momentId: string
): Promise<Moment | null> {
  try {
    // Extract date from moment_id (format: parliament-22-09-2025-moment-1)
    const dateMatch = momentId.match(/parliament-(\d{2}-\d{2}-\d{4})/);
    if (!dateMatch) {
      console.error('Invalid moment_id format:', momentId);
      return null;
    }

    const date = dateMatch[1];
    const objectKey = `moments/parliament-${date}.json`;

    const object = await r2.get(objectKey);
    if (!object) {
      console.error('Moment file not found in R2:', objectKey);
      return null;
    }

    const data = await object.json<{ moments: Moment[] }>();
    const moment = data.moments.find((m) => m.moment_id === momentId);

    if (!moment) {
      console.error('Moment not found in file:', momentId);
      return null;
    }

    return moment;
  } catch (error) {
    console.error('Error fetching moment from R2:', error);
    return null;
  }
}

/**
 * Judge which persona is best for a moment
 */
async function judgePersona(
  moment: Moment,
  env: Env
): Promise<{ persona: Persona; reasoning: string }> {
  try {
    const script = await generateScript(moment, 'ai_decide', env);

    // Parse the AI decision
    const jsonMatch = script.script.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Default to gen_z if parsing fails
      return {
        persona: 'gen_z',
        reasoning: 'Failed to parse AI decision, defaulting to Gen Z persona',
      };
    }

    const decision = JSON.parse(jsonMatch[0]);
    return {
      persona: decision.chosen_persona as Persona,
      reasoning: decision.reasoning,
    };
  } catch (error) {
    console.error('Error judging persona:', error);
    // Default to gen_z on error
    return {
      persona: 'gen_z',
      reasoning: 'Error in AI judging, defaulting to Gen Z persona',
    };
  }
}

/**
 * Generate video asynchronously
 */
async function generateVideoAsync(
  jobId: string,
  moment: Moment,
  persona: Persona,
  env: Env
): Promise<void> {
  try {
    // 1. Generate script
    console.log(`[${jobId}] Generating script for persona: ${persona}`);
    const script = await generateScript(moment, persona, env);

    // Update job with script
    await updateJob(jobId, env, {
      scripts: [script],
    });

    // 2. Generate video with Sora
    console.log(`[${jobId}] Initializing Sora client...`);
    const soraClient = createSoraClient(env);

    // Construct YouTube link with timestamp
    const youtubeLink = `https://www.youtube.com/watch?v=${moment.transcript_id}`;
    const youtubeTimestamp = moment.timestamp_start;

    // Build sanitized prompt (avoids political content moderation)
    const { buildSanitizedPrompt } = await import('./prompts');
    const videoPrompt = buildSanitizedPrompt(script.script, persona, 15);

    console.log(`[${jobId}] Video prompt:`, videoPrompt);

    // Generate video using Sora/Veo client
    console.log(`[${jobId}] Calling video API for generation...`);
    const videoResult = await soraClient.generateVideo(videoPrompt, persona, {
      size: '1024x1792',  // Sora 2 vertical format (9:16 aspect ratio)
      duration: 15,
    });

    console.log(`[${jobId}] Sora generation complete:`, videoResult.sora_generation_id);

    // Update job with completion
    await updateJob(jobId, env, {
      status: 'completed',
      sora_generation_id: videoResult.sora_generation_id,
      video_url: videoResult.video_url,
      youtube_link: youtubeLink,
      youtube_timestamp: youtubeTimestamp,
      completed_at: new Date().toISOString(),
    });

    console.log(`[${jobId}] Video generation complete!`);
    console.log(`[${jobId}] Video URL: ${videoResult.video_url}`);
    console.log(`[${jobId}] Thumbnail URL: ${videoResult.thumbnail_url}`);
  } catch (error) {
    console.error(`[${jobId}] Error generating video:`, error);

    // Update job with error
    await updateJob(jobId, env, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      completed_at: new Date().toISOString(),
    });
  }
}

/**
 * Update job in KV
 */
async function updateJob(
  jobId: string,
  env: Env,
  updates: Partial<VideoJob>
): Promise<void> {
  try {
    const jobData = await env.VIDEO_JOBS.get(jobId);
    if (!jobData) {
      console.error('Job not found for update:', jobId);
      return;
    }

    const job: VideoJob = JSON.parse(jobData);
    const updatedJob: VideoJob = { ...job, ...updates };

    await env.VIDEO_JOBS.put(jobId, JSON.stringify(updatedJob));
  } catch (error) {
    console.error('Error updating job:', error);
  }
}

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,
};

