import OpenAI from 'openai';
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
  private demoMode: boolean;

  constructor(apiKey: string, demoMode: boolean = true) {
    this.openai = new OpenAI({ apiKey });
    this.demoMode = demoMode;
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

    // PRODUCTION CODE: Uncomment when Sora API is available
    // Note: This is based on expected API structure - actual API may differ
    /*
    try {
      const request: SoraGenerationRequest = {
        model: options.model || 'sora-1.0',
        prompt,
        size: options.size || '1080x1920',
        duration: options.duration || 15,
        quality: options.quality || 'hd',
      };

      console.log('[SoraClient] Generating video with prompt:', prompt);
      console.log('[SoraClient] Request:', request);

      // Expected API call (structure may change)
      const response = await this.openai.videos.generate(request);

      // Poll for completion
      let generationStatus = response.status;
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes at 5-second intervals

      while (generationStatus === 'queued' || generationStatus === 'processing') {
        if (attempts >= maxAttempts) {
          throw new Error('Video generation timeout - exceeded maximum wait time');
        }

        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

        const statusResponse = await this.openai.videos.retrieve(response.id);
        generationStatus = statusResponse.status;
        attempts++;

        console.log(`[SoraClient] Generation status: ${generationStatus} (attempt ${attempts}/${maxAttempts})`);
      }

      if (generationStatus === 'failed') {
        throw new Error(`Video generation failed: ${response.error || 'Unknown error'}`);
      }

      // Calculate estimated completion time
      const estimatedCompletion = new Date();
      estimatedCompletion.setMinutes(estimatedCompletion.getMinutes() + 3);

      return {
        video_url: response.video_url!,
        thumbnail_url: response.thumbnail_url || this.generateThumbnailUrl(response.video_url!),
        duration: response.duration || 15,
        persona,
        generation_status: 'complete',
        sora_generation_id: response.id,
        estimated_completion: estimatedCompletion.toISOString(),
      };
    } catch (error) {
      console.error('[SoraClient] Error generating video:', error);
      throw error;
    }
    */

    // Fallback to mock for now
    return this.mockGenerateVideo(prompt, persona, options);
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
export function createSoraClient(env: Env, demoMode?: boolean): SoraClient {
  const isDemoMode = demoMode ?? (env.DEMO_MODE === 'true' || env.DEMO_MODE === true);

  console.log(`[SoraClient] Initializing in ${isDemoMode ? 'DEMO' : 'PRODUCTION'} mode`);

  return new SoraClient(env.OPENAI_API_KEY, isDemoMode);
}
