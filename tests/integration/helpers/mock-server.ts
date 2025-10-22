/**
 * Mock server helper for intercepting external API calls in integration tests
 * Uses Playwright's route interception to mock external services
 */

import { Page, Route } from '@playwright/test';
import {
  createViralMomentDetectionResponse,
  createScriptGenerationResponse,
  createJudgingResponse,
  createEmbeddingResponse,
  createOpenAIErrorResponse,
  VIRAL_MOMENT_FIXTURES,
  SCRIPT_FIXTURES,
  JUDGING_FIXTURE,
} from '../mocks/openai';
import {
  createTTSResponse,
  createVoicesResponse,
  createElevenLabsErrorResponse,
  VOICE_FIXTURES,
} from '../mocks/elevenlabs';
import {
  createModalJobResponse,
  createModalStatusResponse,
  createModalWebhookPayload,
  createModalErrorResponse,
} from '../mocks/modal';
import {
  createHansardResponse,
  createParliamentErrorResponse,
  COMPLETE_HANSARD_FIXTURE,
} from '../mocks/parliament';
import {
  createSearchResponse,
  createVideoDetailsResponse,
  createYouTubeErrorResponse,
  CHANNEL_IDS,
} from '../mocks/youtube';

/**
 * Mock server configuration
 */
export interface MockServerConfig {
  openai?: {
    enabled: boolean;
    failRate?: number; // 0-1, simulates random failures
  };
  elevenlabs?: {
    enabled: boolean;
    failRate?: number;
  };
  modal?: {
    enabled: boolean;
    failRate?: number;
  };
  parliament?: {
    enabled: boolean;
    failRate?: number;
  };
  youtube?: {
    enabled: boolean;
    failRate?: number;
  };
}

/**
 * Request log for debugging
 */
export interface RequestLog {
  url: string;
  method: string;
  timestamp: number;
  response?: {
    status: number;
    body?: any;
  };
}

/**
 * Mock server instance
 */
export class MockServer {
  private config: MockServerConfig;
  private requestLogs: RequestLog[] = [];
  private modalJobStatuses: Map<string, number> = new Map(); // Track job progress

  constructor(config: MockServerConfig = {}) {
    this.config = {
      openai: { enabled: true, ...config.openai },
      elevenlabs: { enabled: true, ...config.elevenlabs },
      modal: { enabled: true, ...config.modal },
      parliament: { enabled: true, ...config.parliament },
      youtube: { enabled: true, ...config.youtube },
    };
  }

  /**
   * Setup mock routes on a Playwright page
   */
  async setup(page: Page): Promise<void> {
    // OpenAI API routes
    if (this.config.openai?.enabled) {
      await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
        await this.handleOpenAIChatCompletion(route);
      });

      await page.route('https://api.openai.com/v1/embeddings', async (route) => {
        await this.handleOpenAIEmbeddings(route);
      });
    }

    // ElevenLabs API routes
    if (this.config.elevenlabs?.enabled) {
      await page.route('https://api.elevenlabs.io/v1/text-to-speech/**', async (route) => {
        await this.handleElevenLabsTTS(route);
      });

      await page.route('https://api.elevenlabs.io/v1/voices', async (route) => {
        await this.handleElevenLabsVoices(route);
      });
    }

    // Modal API routes
    if (this.config.modal?.enabled) {
      await page.route(/.*modal.*\/render/, async (route) => {
        await this.handleModalRender(route);
      });

      await page.route(/.*modal.*\/status\/.*/, async (route) => {
        await this.handleModalStatus(route);
      });
    }

    // Parliament API routes
    if (this.config.parliament?.enabled) {
      await page.route('https://sprs.parl.gov.sg/search/getHansard**', async (route) => {
        await this.handleParliamentHansard(route);
      });
    }

    // YouTube API routes
    if (this.config.youtube?.enabled) {
      await page.route('https://www.googleapis.com/youtube/v3/search**', async (route) => {
        await this.handleYouTubeSearch(route);
      });

      await page.route('https://www.googleapis.com/youtube/v3/videos**', async (route) => {
        await this.handleYouTubeVideos(route);
      });
    }
  }

  /**
   * Handle OpenAI chat completions
   */
  private async handleOpenAIChatCompletion(route: Route): Promise<void> {
    const request = route.request();
    this.logRequest(request.url(), request.method());

    if (this.shouldFail(this.config.openai?.failRate)) {
      const response = createOpenAIErrorResponse('rate_limit_exceeded', 'Rate limit exceeded', 429);
      await route.fulfill({ response });
      return;
    }

    try {
      const body = JSON.parse(request.postData() || '{}');
      const messages = body.messages || [];
      const systemMessage = messages.find((m: any) => m.role === 'system')?.content || '';

      // Determine which type of completion based on system message
      let responseData;

      if (systemMessage.includes('viral moments')) {
        responseData = createViralMomentDetectionResponse(VIRAL_MOMENT_FIXTURES);
      } else if (systemMessage.includes('script') || systemMessage.includes('persona')) {
        responseData = createScriptGenerationResponse(Object.values(SCRIPT_FIXTURES));
      } else if (systemMessage.includes('judge') || systemMessage.includes('winner')) {
        responseData = createJudgingResponse(JUDGING_FIXTURE);
      } else {
        // Default response
        responseData = createViralMomentDetectionResponse([VIRAL_MOMENT_FIXTURES[0]]);
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(responseData),
      });

      this.logResponse(request.url(), 200, responseData);
    } catch (error) {
      const errorResponse = createOpenAIErrorResponse(
        'invalid_request',
        error instanceof Error ? error.message : 'Unknown error'
      );
      await route.fulfill({ response: errorResponse });
    }
  }

  /**
   * Handle OpenAI embeddings
   */
  private async handleOpenAIEmbeddings(route: Route): Promise<void> {
    const request = route.request();
    this.logRequest(request.url(), request.method());

    if (this.shouldFail(this.config.openai?.failRate)) {
      const response = createOpenAIErrorResponse('rate_limit_exceeded', 'Rate limit exceeded', 429);
      await route.fulfill({ response });
      return;
    }

    try {
      const body = JSON.parse(request.postData() || '{}');
      const input = body.input || [];
      const texts = Array.isArray(input) ? input : [input];

      const responseData = createEmbeddingResponse(texts);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(responseData),
      });

      this.logResponse(request.url(), 200, responseData);
    } catch (error) {
      const errorResponse = createOpenAIErrorResponse(
        'invalid_request',
        error instanceof Error ? error.message : 'Unknown error'
      );
      await route.fulfill({ response: errorResponse });
    }
  }

  /**
   * Handle ElevenLabs TTS
   */
  private async handleElevenLabsTTS(route: Route): Promise<void> {
    const request = route.request();
    this.logRequest(request.url(), request.method());

    if (this.shouldFail(this.config.elevenlabs?.failRate)) {
      const response = createElevenLabsErrorResponse('Rate limit exceeded', 429);
      await route.fulfill({ response });
      return;
    }

    try {
      const body = JSON.parse(request.postData() || '{}');
      const text = body.text || '';
      const voiceId = request.url().split('/text-to-speech/')[1]?.split('?')[0] || 'default';

      const response = createTTSResponse(text, voiceId);
      const buffer = await response.arrayBuffer();

      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: Buffer.from(buffer),
        headers: Object.fromEntries(response.headers.entries()),
      });

      this.logResponse(request.url(), 200, { audioLength: buffer.byteLength });
    } catch (error) {
      const errorResponse = createElevenLabsErrorResponse(
        error instanceof Error ? error.message : 'Unknown error'
      );
      await route.fulfill({ response: errorResponse });
    }
  }

  /**
   * Handle ElevenLabs voices list
   */
  private async handleElevenLabsVoices(route: Route): Promise<void> {
    const request = route.request();
    this.logRequest(request.url(), request.method());

    const voices = Object.values(VOICE_FIXTURES);
    const response = createVoicesResponse(voices);

    await route.fulfill({ response });
    this.logResponse(request.url(), 200, { voiceCount: voices.length });
  }

  /**
   * Handle Modal render job submission
   */
  private async handleModalRender(route: Route): Promise<void> {
    const request = route.request();
    this.logRequest(request.url(), request.method());

    if (this.shouldFail(this.config.modal?.failRate)) {
      const response = createModalErrorResponse('Service temporarily unavailable', 503);
      await route.fulfill({ response });
      return;
    }

    const responseData = createModalJobResponse(120);
    this.modalJobStatuses.set(responseData.job_id, 0); // Initialize progress

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseData),
    });

    this.logResponse(request.url(), 200, responseData);
  }

  /**
   * Handle Modal job status polling
   */
  private async handleModalStatus(route: Route): Promise<void> {
    const request = route.request();
    this.logRequest(request.url(), request.method());

    const jobId = request.url().split('/status/')[1] || 'unknown';
    let progress = this.modalJobStatuses.get(jobId) || 0;

    // Simulate progressive completion
    progress = Math.min(100, progress + 25);
    this.modalJobStatuses.set(jobId, progress);

    const status = progress < 100 ? (progress === 0 ? 'queued' : 'running') : 'completed';
    const responseData = createModalStatusResponse(jobId, status, { progress });

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseData),
    });

    this.logResponse(request.url(), 200, responseData);
  }

  /**
   * Handle Parliament Hansard API
   */
  private async handleParliamentHansard(route: Route): Promise<void> {
    const request = route.request();
    this.logRequest(request.url(), request.method());

    if (this.shouldFail(this.config.parliament?.failRate)) {
      const response = createParliamentErrorResponse('Service unavailable', 503);
      await route.fulfill({ response });
      return;
    }

    const url = new URL(request.url());
    const sittingDate = url.searchParams.get('sittingDate');

    if (!sittingDate) {
      const response = createParliamentErrorResponse('Missing sittingDate parameter', 400);
      await route.fulfill({ response });
      return;
    }

    const responseData = COMPLETE_HANSARD_FIXTURE;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseData),
    });

    this.logResponse(request.url(), 200, responseData);
  }

  /**
   * Handle YouTube search API
   */
  private async handleYouTubeSearch(route: Route): Promise<void> {
    const request = route.request();
    this.logRequest(request.url(), request.method());

    if (this.shouldFail(this.config.youtube?.failRate)) {
      const response = createYouTubeErrorResponse('Quota exceeded', 403, 'quotaExceeded');
      await route.fulfill({ response });
      return;
    }

    const url = new URL(request.url());
    const query = url.searchParams.get('q') || '';
    const channelId = url.searchParams.get('channelId') || CHANNEL_IDS.parliament;

    const responseData = createSearchResponse(query, channelId, 5);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseData),
    });

    this.logResponse(request.url(), 200, responseData);
  }

  /**
   * Handle YouTube videos API
   */
  private async handleYouTubeVideos(route: Route): Promise<void> {
    const request = route.request();
    this.logRequest(request.url(), request.method());

    const url = new URL(request.url());
    const videoId = url.searchParams.get('id') || 'unknown';

    const responseData = createVideoDetailsResponse(videoId);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseData),
    });

    this.logResponse(request.url(), 200, responseData);
  }

  /**
   * Determine if request should fail based on fail rate
   */
  private shouldFail(failRate?: number): boolean {
    if (!failRate || failRate === 0) return false;
    return Math.random() < failRate;
  }

  /**
   * Log request
   */
  private logRequest(url: string, method: string): void {
    this.requestLogs.push({
      url,
      method,
      timestamp: Date.now(),
    });
  }

  /**
   * Log response
   */
  private logResponse(url: string, status: number, body?: any): void {
    const log = this.requestLogs.find(l => l.url === url && !l.response);
    if (log) {
      log.response = { status, body };
    }
  }

  /**
   * Get request logs
   */
  getRequestLogs(): RequestLog[] {
    return this.requestLogs;
  }

  /**
   * Clear request logs
   */
  clearLogs(): void {
    this.requestLogs = [];
  }

  /**
   * Get logs for specific API
   */
  getLogsForAPI(apiPattern: RegExp): RequestLog[] {
    return this.requestLogs.filter(log => apiPattern.test(log.url));
  }

  /**
   * Reset mock server state
   */
  reset(): void {
    this.requestLogs = [];
    this.modalJobStatuses.clear();
  }
}

/**
 * Create a mock server with default configuration
 */
export function createMockServer(config?: MockServerConfig): MockServer {
  return new MockServer(config);
}
