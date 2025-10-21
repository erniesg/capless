import { Env } from './types/env';
import {
  ComposeRequestSchema,
  PublishRequestSchema,
  CleanupRequestSchema,
  ErrorResponse
} from './types/schemas';
import { ModalClient } from './compositor/modal-client';
import { TikTokPublisher } from './publishers/tiktok';
import { InstagramPublisher } from './publishers/instagram';
import { YouTubePublisher } from './publishers/youtube';
import { R2Manager } from './storage/r2-manager';

export { RenderJobTracker } from './compositor/render-tracker';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

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
      // Health check endpoint
      if (path === '/health') {
        return handleHealth(env, corsHeaders);
      }

      // Video composition endpoint
      if (path === '/api/video/compose' && request.method === 'POST') {
        return handleCompose(request, env, corsHeaders);
      }

      // Video status endpoint
      if (path.startsWith('/api/video/status/') && request.method === 'GET') {
        const jobId = path.split('/').pop();
        if (!jobId) {
          return jsonResponse({ error: 'Job ID required' }, 400, corsHeaders);
        }
        return handleStatus(jobId, env, corsHeaders);
      }

      // Video publishing endpoint
      if (path === '/api/video/publish' && request.method === 'POST') {
        return handlePublish(request, env, corsHeaders);
      }

      // Video cleanup endpoint
      if (path === '/api/video/cleanup' && request.method === 'POST') {
        return handleCleanup(request, env, corsHeaders);
      }

      return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
    } catch (error) {
      console.error('Unhandled error:', error);
      return jsonResponse(
        { error: 'Internal server error', details: String(error) },
        500,
        corsHeaders
      );
    }
  }
};

async function handleHealth(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const modalClient = new ModalClient({
    endpoint: env.MODAL_ENDPOINT,
    apiKey: env.MODAL_API_KEY,
    maxRetries: parseInt(env.MODAL_MAX_RETRIES),
    timeout: parseInt(env.MODAL_TIMEOUT_MS)
  });

  const r2Manager = new R2Manager({
    bucket: env.R2,
    publicUrl: env.R2_PUBLIC_URL
  });

  const tiktokPublisher = new TikTokPublisher({
    accessToken: env.TIKTOK_ACCESS_TOKEN
  });

  const instagramPublisher = new InstagramPublisher({
    accessToken: env.INSTAGRAM_ACCESS_TOKEN
  });

  const youtubePublisher = new YouTubePublisher({
    apiKey: env.YOUTUBE_API_KEY
  });

  const [modalAvailable, r2Available, tiktokAvailable, instagramAvailable, youtubeAvailable] =
    await Promise.all([
      modalClient.checkHealth(),
      r2Manager.checkHealth(),
      tiktokPublisher.checkHealth(),
      instagramPublisher.checkHealth(),
      youtubePublisher.checkHealth()
    ]);

  const allHealthy = modalAvailable && r2Available && tiktokAvailable && instagramAvailable && youtubeAvailable;
  const status = allHealthy ? 'healthy' : 'degraded';

  return jsonResponse({
    status,
    service: 'capless-video-compositor',
    timestamp: new Date().toISOString(),
    modal_available: modalAvailable,
    r2_available: r2Available,
    tiktok_api_available: tiktokAvailable,
    instagram_api_available: instagramAvailable,
    youtube_api_available: youtubeAvailable
  }, 200, corsHeaders);
}

async function handleCompose(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const body = await request.json();
    const validatedData = ComposeRequestSchema.parse(body);

    // Initialize Modal client
    const modalClient = new ModalClient({
      endpoint: env.MODAL_ENDPOINT,
      apiKey: env.MODAL_API_KEY,
      maxRetries: parseInt(env.MODAL_MAX_RETRIES),
      timeout: parseInt(env.MODAL_TIMEOUT_MS)
    });

    // Trigger render on Modal
    const modalJob = await modalClient.triggerRender({
      script: validatedData.script,
      audio_url: validatedData.audio_url,
      video_url: validatedData.video_url,
      persona: validatedData.persona,
      template: validatedData.template,
      effects: validatedData.effects
    });

    // Create job ID
    const jobId = crypto.randomUUID();

    // Initialize Durable Object for job tracking
    const durableObjectId = env.RENDER_JOB_TRACKER.idFromName(jobId);
    const durableObject = env.RENDER_JOB_TRACKER.get(durableObjectId);

    await durableObject.fetch('https://internal/initialize', {
      method: 'POST',
      body: JSON.stringify({
        job_id: jobId,
        modal_job_id: modalJob.job_id,
        metadata: {
          script: validatedData.script,
          audio_url: validatedData.audio_url,
          video_url: validatedData.video_url,
          persona: validatedData.persona,
          template: validatedData.template
        }
      })
    });

    // Start background polling (fire and forget)
    const pollInterval = parseInt(env.MODAL_POLL_INTERVAL_MS);
    startPolling(jobId, modalJob.job_id, env, pollInterval);

    // Calculate estimated completion time
    const estimatedCompletion = Date.now() + (modalJob.estimated_duration * 1000);

    return jsonResponse({
      job_id: jobId,
      status: 'rendering',
      estimated_completion: estimatedCompletion,
      modal_job_id: modalJob.job_id
    }, 200, corsHeaders);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return jsonResponse({
        error: 'Validation error',
        details: error.errors
      }, 400, corsHeaders);
    }

    return jsonResponse({
      error: 'Failed to trigger render',
      details: String(error)
    }, 500, corsHeaders);
  }
}

async function handleStatus(jobId: string, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    // Get Durable Object
    const durableObjectId = env.RENDER_JOB_TRACKER.idFromName(jobId);
    const durableObject = env.RENDER_JOB_TRACKER.get(durableObjectId);

    const response = await durableObject.fetch('https://internal/state', {
      method: 'GET'
    });

    if (!response.ok) {
      return jsonResponse({ error: 'Job not found' }, 404, corsHeaders);
    }

    const state = await response.json();
    return jsonResponse(state, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({
      error: 'Failed to get job status',
      details: String(error)
    }, 500, corsHeaders);
  }
}

async function handlePublish(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const body = await request.json();
    const validatedData = PublishRequestSchema.parse(body);

    // Handle scheduled publishing
    if (validatedData.schedule && validatedData.schedule > Date.now()) {
      const jobId = crypto.randomUUID();
      // TODO: Implement scheduled publishing with Queue or Durable Objects alarm
      return jsonResponse({
        scheduled: true,
        publish_at: validatedData.schedule,
        job_id: jobId
      }, 200, corsHeaders);
    }

    // Initialize publishers
    const publishers = {
      tiktok: new TikTokPublisher({ accessToken: env.TIKTOK_ACCESS_TOKEN }),
      instagram: new InstagramPublisher({ accessToken: env.INSTAGRAM_ACCESS_TOKEN }),
      youtube: new YouTubePublisher({ apiKey: env.YOUTUBE_API_KEY })
    };

    // Publish to all platforms in parallel
    const publishPromises = validatedData.platforms.map(platform =>
      publishers[platform].publish(validatedData.video_url, validatedData.metadata)
    );

    const results = await Promise.all(publishPromises);

    const published = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return jsonResponse({
      published,
      failed,
      results
    }, 200, corsHeaders);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return jsonResponse({
        error: 'Validation error',
        details: error.errors
      }, 400, corsHeaders);
    }

    return jsonResponse({
      error: 'Failed to publish video',
      details: String(error)
    }, 500, corsHeaders);
  }
}

async function handleCleanup(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const body = await request.json();
    const validatedData = CleanupRequestSchema.parse(body);

    const r2Manager = new R2Manager({
      bucket: env.R2,
      publicUrl: env.R2_PUBLIC_URL
    });

    const result = await r2Manager.cleanup(
      validatedData.older_than,
      validatedData.pattern,
      validatedData.dry_run
    );

    return jsonResponse(result, 200, corsHeaders);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return jsonResponse({
        error: 'Validation error',
        details: error.errors
      }, 400, corsHeaders);
    }

    return jsonResponse({
      error: 'Cleanup failed',
      details: String(error)
    }, 500, corsHeaders);
  }
}

// Background polling function
async function startPolling(jobId: string, modalJobId: string, env: Env, pollInterval: number): Promise<void> {
  const modalClient = new ModalClient({
    endpoint: env.MODAL_ENDPOINT,
    apiKey: env.MODAL_API_KEY,
    maxRetries: parseInt(env.MODAL_MAX_RETRIES),
    timeout: parseInt(env.MODAL_TIMEOUT_MS)
  });

  const durableObjectId = env.RENDER_JOB_TRACKER.idFromName(jobId);
  const durableObject = env.RENDER_JOB_TRACKER.get(durableObjectId);

  try {
    await modalClient.pollUntilComplete(
      modalJobId,
      pollInterval,
      async (progress) => {
        await durableObject.fetch('https://internal/progress', {
          method: 'POST',
          body: JSON.stringify({ progress })
        });
      }
    );

    // Mark as completed
    const finalStatus = await modalClient.getJobStatus(modalJobId);
    if (finalStatus.video_url) {
      await durableObject.fetch('https://internal/complete', {
        method: 'POST',
        body: JSON.stringify({
          video_url: finalStatus.video_url,
          preview_url: finalStatus.video_url
        })
      });
    }
  } catch (error) {
    // Mark as failed
    await durableObject.fetch('https://internal/fail', {
      method: 'POST',
      body: JSON.stringify({ error: String(error) })
    });
  }
}

function jsonResponse(data: any, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}
