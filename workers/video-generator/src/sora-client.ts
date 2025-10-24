import OpenAI from 'openai';
import Replicate from 'replicate';
import { Env, Persona } from './types';

/**
 * Sora API response structure (based on OpenAI API patterns)
 * This is a placeholder structure - actual API may differ when available
 */
export interface SoraGenerationRequest {
  model: 'sora-1.0' | 'sora-1.0-turbo';
  prompt: string;
  size: '1080x1920' | '1920x1080' | '1024x1024';
  duration?: number; // seconds, typically 10-15 for TikTok
  quality?: 'standard' | 'hd';
}

export interface SoraGenerationResponse {
  id: string;
  object: 'video.generation';
  created: number;
  model: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  video_url?: string;
  thumbnail_url?: string;
  duration?: number;
  error?: string;
}

export interface VideoGenerationResult {
  video_url: string;
  thumbnail_url: string;
  duration: number;
  persona: string;
  generation_status: 'processing' | 'complete' | 'failed';
  sora_generation_id: string;
  estimated_completion?: string; // ISO timestamp
}

/**
 * SoraClient - Handles interactions with OpenAI Sora API
 *
 * DEMO MODE: When DEMO_MODE=true, returns mock responses
 * PRODUCTION MODE: When Sora API is available, uses real API calls
 */
export class SoraClient {
  private openai: OpenAI;
  private replicate: Replicate | null;
  private demoMode: boolean;
  private useVeo: boolean;

  constructor(apiKey: string, replicateToken: string | undefined, demoMode: boolean = true, useVeo: boolean = true) {
    this.openai = new OpenAI({ apiKey });
    this.replicate = replicateToken ? new Replicate({ auth: replicateToken }) : null;
    this.demoMode = demoMode;
    this.useVeo = useVeo;
  }

  /**
   * Generate a video using Sora API
   *
   * @param prompt - The text prompt describing the video to generate
   * @param persona - The persona generating the content
   * @param options - Additional generation options
   * @returns VideoGenerationResult with video URL and metadata
   */
  async generateVideo(
    prompt: string,
    persona: Persona,
    options: Partial<SoraGenerationRequest> = {}
  ): Promise<VideoGenerationResult> {
    if (this.demoMode) {
      return this.mockGenerateVideo(prompt, persona, options);
    }

    // Use Veo 3.1 via Replicate if configured
    if (this.useVeo && this.replicate) {
      return this.generateVideoWithVeo(prompt, persona, options);
    }

    // PRODUCTION CODE: Real Sora 2 API integration
    try {
      const model = options.model || 'sora-2';
      const size = options.size || '1024x1792';  // Sora 2 vertical format (9:16 aspect ratio)
      const duration = options.duration || 15;

      console.log('[SoraClient] Generating video with Sora 2');
      console.log('[SoraClient] Model:', model);
      console.log('[SoraClient] Size:', size);
      console.log('[SoraClient] Duration:', duration);
      console.log('[SoraClient] Prompt length:', prompt.length);

      // Create video request
      const response = await fetch('https://api.openai.com/v1/videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openai.apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          size,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sora API error: ${response.status} ${errorText}`);
      }

      const videoJob = await response.json() as { video_id: string };
      const videoId = videoJob.video_id;

      console.log('[SoraClient] Video job created:', videoId);

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes at 5-second intervals
      let videoStatus: any;

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

        const statusResponse = await fetch(`https://api.openai.com/v1/videos/${videoId}`, {
          headers: {
            'Authorization': `Bearer ${this.openai.apiKey}`,
          },
        });

        if (!statusResponse.ok) {
          throw new Error(`Failed to check video status: ${statusResponse.status}`);
        }

        videoStatus = await statusResponse.json();
        attempts++;

        console.log(`[SoraClient] Status: ${videoStatus.status} (attempt ${attempts}/${maxAttempts})`);

        if (videoStatus.status === 'completed') {
          break;
        }

        if (videoStatus.status === 'failed') {
          throw new Error(`Video generation failed: ${videoStatus.error || 'Unknown error'}`);
        }
      }

      if (attempts >= maxAttempts) {
        throw new Error('Video generation timeout - exceeded maximum wait time');
      }

      // Download video content
      const contentUrl = `https://api.openai.com/v1/videos/${videoId}/content`;
      console.log('[SoraClient] Video generation complete!');
      console.log('[SoraClient] Content URL:', contentUrl);

      return {
        video_url: contentUrl,
        thumbnail_url: this.generateThumbnailUrl(contentUrl),
        duration,
        persona,
        generation_status: 'complete',
        sora_generation_id: videoId,
      };
    } catch (error) {
      console.error('[SoraClient] Error generating video:', error);
      throw error;
    }
  }

  /**
   * Generate video using Veo 3.1 via Replicate
   */
  private async generateVideoWithVeo(
    prompt: string,
    persona: Persona,
    options: Partial<SoraGenerationRequest> = {}
  ): Promise<VideoGenerationResult> {
    if (!this.replicate) {
      throw new Error('Replicate client not initialized');
    }

    try {
      const duration = options.duration || 8; // Veo 3.1 supports 4, 8, or 16 seconds
      const aspectRatio = options.size === '1024x1792' ? '9:16' : '16:9'; // Vertical or horizontal

      console.log('[VeoClient] Generating video with Veo 3.1 via Replicate');
      console.log('[VeoClient] Model: google/veo-3.1');
      console.log('[VeoClient] Duration:', duration);
      console.log('[VeoClient] Aspect ratio:', aspectRatio);
      console.log('[VeoClient] Prompt length:', prompt.length);

      // Call Replicate Veo 3.1 API
      const output = await this.replicate.run('google/veo-3.1', {
        input: {
          prompt,
          duration,
          aspect_ratio: aspectRatio,
          resolution: '1080p',
          generate_audio: true,
        },
      }) as any;

      console.log('[VeoClient] Video generation complete!');
      console.log('[VeoClient] Output type:', typeof output);

      // Extract video URL from Replicate output
      // Veo 3.1 returns a string URL according to schema: {"type": "string", "format": "uri"}
      // But Replicate SDK might wrap it in a file object with .url() method
      let videoUrl: string;

      if (typeof output === 'string') {
        videoUrl = output;
      } else if (output && typeof output === 'object') {
        // Try to call .url() if it's a file object
        if (typeof (output as any).url === 'function') {
          videoUrl = (output as any).url();
        } else if (typeof (output as any).url === 'string') {
          videoUrl = (output as any).url;
        } else if (Array.isArray(output) && output.length > 0) {
          videoUrl = output[0];
        } else {
          throw new Error(`Unexpected Replicate output format: ${JSON.stringify(output)}`);
        }
      } else {
        throw new Error(`Unexpected Replicate output type: ${typeof output}`);
      }

      if (!videoUrl || typeof videoUrl !== 'string') {
        throw new Error(`Invalid video URL: ${videoUrl}`);
      }

      console.log('[VeoClient] Extracted video URL:', videoUrl);

      return {
        video_url: videoUrl,
        thumbnail_url: this.generateThumbnailUrl(videoUrl),
        duration,
        persona,
        generation_status: 'complete',
        sora_generation_id: `veo-${Date.now()}-${persona}`,
      };
    } catch (error) {
      console.error('[VeoClient] Error generating video:', error);
      throw error;
    }
  }

  /**
   * Check the status of a video generation job
   *
   * @param generationId - The Sora generation ID to check
   * @returns VideoGenerationResult with current status
   */
  async checkStatus(generationId: string): Promise<VideoGenerationResult> {
    if (this.demoMode) {
      return this.mockCheckStatus(generationId);
    }

    // PRODUCTION CODE: Uncomment when Sora API is available
    /*
    try {
      const response = await this.openai.videos.retrieve(generationId);

      return {
        video_url: response.video_url || '',
        thumbnail_url: response.thumbnail_url || '',
        duration: response.duration || 15,
        persona: 'unknown', // Would need to track this separately
        generation_status: response.status === 'completed' ? 'complete' :
                          response.status === 'failed' ? 'failed' : 'processing',
        sora_generation_id: response.id,
      };
    } catch (error) {
      console.error('[SoraClient] Error checking status:', error);
      throw error;
    }
    */

    return this.mockCheckStatus(generationId);
  }

  /**
   * DEMO MODE: Mock video generation with realistic timing
   * Returns placeholder video URLs for demo purposes
   */
  private async mockGenerateVideo(
    prompt: string,
    persona: Persona,
    options: Partial<SoraGenerationRequest> = {}
  ): Promise<VideoGenerationResult> {
    console.log('[SoraClient DEMO] Mock generating video with prompt:', prompt);
    console.log('[SoraClient DEMO] Persona:', persona);
    console.log('[SoraClient DEMO] Options:', options);

    // Simulate API delay (realistic Sora timing: 2-3 minutes)
    const mockDelay = 2000; // 2 seconds for demo (would be 120-180 seconds in reality)
    await new Promise((resolve) => setTimeout(resolve, mockDelay));

    const generationId = `sora-demo-${Date.now()}-${persona}`;

    // Mock completion time (3 minutes from now)
    const estimatedCompletion = new Date();
    estimatedCompletion.setMinutes(estimatedCompletion.getMinutes() + 3);

    // Placeholder video URLs - in a real demo, these could be:
    // 1. Sample TikTok videos that match the persona style
    // 2. Static images with text overlays
    // 3. Pre-generated sample videos
    const mockVideoUrls: Record<Persona, string> = {
      gen_z: 'https://storage.googleapis.com/capless-demo/samples/gen-z-reaction.mp4',
      kopitiam_uncle: 'https://storage.googleapis.com/capless-demo/samples/uncle-wisdom.mp4',
      auntie: 'https://storage.googleapis.com/capless-demo/samples/auntie-concern.mp4',
      attenborough: 'https://storage.googleapis.com/capless-demo/samples/attenborough-narration.mp4',
      ai_decide: 'https://storage.googleapis.com/capless-demo/samples/ai-selected.mp4',
    };

    const mockThumbnailUrls: Record<Persona, string> = {
      gen_z: 'https://storage.googleapis.com/capless-demo/thumbs/gen-z-thumb.jpg',
      kopitiam_uncle: 'https://storage.googleapis.com/capless-demo/thumbs/uncle-thumb.jpg',
      auntie: 'https://storage.googleapis.com/capless-demo/thumbs/auntie-thumb.jpg',
      attenborough: 'https://storage.googleapis.com/capless-demo/thumbs/attenborough-thumb.jpg',
      ai_decide: 'https://storage.googleapis.com/capless-demo/thumbs/ai-thumb.jpg',
    };

    const result: VideoGenerationResult = {
      video_url: mockVideoUrls[persona],
      thumbnail_url: mockThumbnailUrls[persona],
      duration: options.duration || 15,
      persona,
      generation_status: 'complete',
      sora_generation_id: generationId,
      estimated_completion: estimatedCompletion.toISOString(),
    };

    console.log('[SoraClient DEMO] Mock generation complete:', result);

    return result;
  }

  /**
   * DEMO MODE: Mock status check
   */
  private async mockCheckStatus(generationId: string): Promise<VideoGenerationResult> {
    console.log('[SoraClient DEMO] Mock checking status for:', generationId);

    // Extract persona from generation ID if possible
    const persona = this.extractPersonaFromId(generationId);

    return {
      video_url: `https://storage.googleapis.com/capless-demo/samples/${persona}-reaction.mp4`,
      thumbnail_url: `https://storage.googleapis.com/capless-demo/thumbs/${persona}-thumb.jpg`,
      duration: 15,
      persona,
      generation_status: 'complete',
      sora_generation_id: generationId,
    };
  }

  /**
   * Extract persona from generation ID
   */
  private extractPersonaFromId(generationId: string): string {
    const personas: Persona[] = ['gen_z', 'kopitiam_uncle', 'auntie', 'attenborough', 'ai_decide'];

    for (const persona of personas) {
      if (generationId.includes(persona)) {
        return persona;
      }
    }

    return 'gen_z'; // Default
  }

  /**
   * Generate thumbnail URL from video URL
   */
  private generateThumbnailUrl(videoUrl: string): string {
    // Replace video extension with jpg for thumbnail
    return videoUrl.replace(/\.(mp4|mov|avi)$/, '-thumb.jpg');
  }
}

/**
 * Factory function to create SoraClient
 */
export function createSoraClient(env: Env, demoMode?: boolean, useVeo?: boolean): SoraClient {
  const isDemoMode = demoMode ?? (env.DEMO_MODE === 'true' || env.DEMO_MODE === true);
  const shouldUseVeo = useVeo ?? (env.USE_VEO === 'true' || env.USE_VEO === true);

  console.log(`[SoraClient] Initializing in ${isDemoMode ? 'DEMO' : 'PRODUCTION'} mode`);
  console.log(`[SoraClient] Video provider: ${shouldUseVeo ? 'Veo 3.1' : 'Sora 2'}`);

  // In demo mode, use a dummy API key since we won't actually call the API
  const apiKey = isDemoMode ? 'sk-demo-key' : env.OPENAI_API_KEY;
  const replicateToken = env.REPLICATE_API_TOKEN;

  return new SoraClient(apiKey, replicateToken, isDemoMode, shouldUseVeo);
}
