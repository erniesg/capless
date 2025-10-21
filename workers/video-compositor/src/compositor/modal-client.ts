import { ModalJobRequest, ModalJobResponse, ModalStatusResponse } from '../types/schemas';

export interface ModalConfig {
  endpoint: string;
  apiKey: string;
  maxRetries: number;
  timeout: number;
}

export class ModalClient {
  private config: ModalConfig;

  constructor(config: ModalConfig) {
    this.config = config;
  }

  async triggerRender(request: ModalJobRequest): Promise<ModalJobResponse> {
    const response = await this.fetchWithRetry('/render/video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Modal API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    return {
      job_id: data.job_id || data.id,
      status: data.status || 'queued',
      estimated_duration: data.estimated_duration || 90 // default 90 seconds
    };
  }

  async getJobStatus(jobId: string): Promise<ModalStatusResponse> {
    const response = await this.fetchWithRetry(`/render/status/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Job not found: ${jobId}`);
      }
      const error = await response.text();
      throw new Error(`Modal API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;

    // Map Modal status to our status
    let status: 'queued' | 'running' | 'completed' | 'failed';
    if (data.status === 'pending' || data.status === 'queued') {
      status = 'queued';
    } else if (data.status === 'running' || data.status === 'processing') {
      status = 'running';
    } else if (data.status === 'success' || data.status === 'completed') {
      status = 'completed';
    } else {
      status = 'failed';
    }

    return {
      status,
      progress: data.progress || this.estimateProgress(status),
      video_url: data.video_url || data.result_url,
      error: data.error || data.error_message
    };
  }

  async pollUntilComplete(
    jobId: string,
    pollInterval: number = 10000,
    onProgress?: (progress: number) => Promise<void>
  ): Promise<ModalStatusResponse> {
    const startTime = Date.now();
    const timeout = this.config.timeout;

    while (true) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(`Job ${jobId} timed out after ${timeout}ms`);
      }

      const status = await this.getJobStatus(jobId);

      // Notify progress callback
      if (onProgress) {
        await onProgress(status.progress);
      }

      // Check if completed or failed
      if (status.status === 'completed') {
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(status.error || 'Render job failed');
      }

      // Wait before next poll
      await this.sleep(pollInterval);
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async fetchWithRetry(
    path: string,
    options: RequestInit,
    retryCount: number = 0
  ): Promise<Response> {
    const url = `${this.config.endpoint}${path}`;

    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30000)
      });

      // Retry on 5xx errors
      if (response.status >= 500 && retryCount < this.config.maxRetries) {
        await this.sleep(1000 * Math.pow(2, retryCount)); // Exponential backoff
        return this.fetchWithRetry(path, options, retryCount + 1);
      }

      return response;
    } catch (error) {
      // Retry on network errors
      if (retryCount < this.config.maxRetries) {
        await this.sleep(1000 * Math.pow(2, retryCount));
        return this.fetchWithRetry(path, options, retryCount + 1);
      }
      throw error;
    }
  }

  private estimateProgress(status: string): number {
    switch (status) {
      case 'queued':
        return 0;
      case 'running':
        return 50;
      case 'completed':
        return 100;
      case 'failed':
        return 0;
      default:
        return 0;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
