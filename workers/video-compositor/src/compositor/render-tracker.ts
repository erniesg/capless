import { DurableObject } from 'cloudflare:workers';
import { JobStatus } from '../types/schemas';

export interface RenderJobState {
  job_id: string;
  status: 'queued' | 'rendering' | 'completed' | 'failed';
  modal_job_id: string;
  progress: number;
  video_url?: string;
  preview_url?: string;
  error?: string;
  retry_count: number;
  created_at: number;
  updated_at: number;
  metadata?: {
    script: string;
    audio_url: string;
    video_url: string;
    persona: string;
    template: string;
  };
}

export class RenderJobTracker extends DurableObject {
  private sessions: Set<WebSocket> = new Set();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // WebSocket upgrade for real-time updates
      if (request.headers.get('Upgrade') === 'websocket') {
        return this.handleWebSocket(request);
      }

      // GET /state - Get current job state
      if (request.method === 'GET' && path === '/state') {
        const state = await this.getState();
        if (!state) {
          return new Response(JSON.stringify({ error: 'Job not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify(state), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // POST /initialize - Create new job
      if (request.method === 'POST' && path === '/initialize') {
        const data = await request.json() as Partial<RenderJobState>;
        const state = await this.initialize(data);
        return new Response(JSON.stringify(state), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // POST /update - Update job state
      if (request.method === 'POST' && path === '/update') {
        const data = await request.json() as Partial<RenderJobState>;
        const state = await this.update(data);
        return new Response(JSON.stringify(state), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // POST /progress - Update progress
      if (request.method === 'POST' && path === '/progress') {
        const { progress } = await request.json() as { progress: number };
        const state = await this.updateProgress(progress);
        return new Response(JSON.stringify(state), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // POST /complete - Mark as completed
      if (request.method === 'POST' && path === '/complete') {
        const { video_url, preview_url } = await request.json() as { video_url: string; preview_url?: string };
        const state = await this.markCompleted(video_url, preview_url);
        return new Response(JSON.stringify(state), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // POST /fail - Mark as failed
      if (request.method === 'POST' && path === '/fail') {
        const { error } = await request.json() as { error: string };
        const state = await this.markFailed(error);
        return new Response(JSON.stringify(state), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not found', { status: 404 });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async getState(): Promise<RenderJobState | null> {
    const state = await this.ctx.storage.get<RenderJobState>('state');
    return state || null;
  }

  private async initialize(data: Partial<RenderJobState>): Promise<RenderJobState> {
    const now = Date.now();
    const state: RenderJobState = {
      job_id: data.job_id || crypto.randomUUID(),
      status: 'queued',
      modal_job_id: data.modal_job_id || '',
      progress: 0,
      retry_count: 0,
      created_at: now,
      updated_at: now,
      metadata: data.metadata
    };

    await this.ctx.storage.put('state', state);
    return state;
  }

  private async update(data: Partial<RenderJobState>): Promise<RenderJobState> {
    const current = await this.getState();
    if (!current) {
      throw new Error('Job not initialized');
    }

    const updated: RenderJobState = {
      ...current,
      ...data,
      updated_at: Date.now()
    };

    await this.ctx.storage.put('state', updated);
    this.broadcast({ type: 'update', state: updated });
    return updated;
  }

  async updateProgress(progress: number): Promise<RenderJobState> {
    const state = await this.getState();
    if (!state) {
      throw new Error('Job not initialized');
    }

    state.progress = Math.min(100, Math.max(0, progress));
    state.status = progress === 100 ? 'completed' : 'rendering';
    state.updated_at = Date.now();

    await this.ctx.storage.put('state', state);
    this.broadcast({ type: 'progress', progress: state.progress });
    return state;
  }

  async markCompleted(video_url: string, preview_url?: string): Promise<RenderJobState> {
    const state = await this.getState();
    if (!state) {
      throw new Error('Job not initialized');
    }

    state.status = 'completed';
    state.video_url = video_url;
    if (preview_url) {
      state.preview_url = preview_url;
    }
    state.progress = 100;
    state.updated_at = Date.now();

    await this.ctx.storage.put('state', state);
    this.broadcast({ type: 'completed', video_url, preview_url });
    return state;
  }

  async markFailed(error: string): Promise<RenderJobState> {
    const state = await this.getState();
    if (!state) {
      throw new Error('Job not initialized');
    }

    state.status = 'failed';
    state.error = error;
    state.updated_at = Date.now();

    await this.ctx.storage.put('state', state);
    this.broadcast({ type: 'failed', error });
    return state;
  }

  private handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    this.sessions.add(server);

    // Send current state immediately
    this.getState().then(state => {
      if (state && server.readyState === WebSocket.OPEN) {
        server.send(JSON.stringify({ type: 'init', state }));
      }
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  private broadcast(message: any): void {
    const messageStr = JSON.stringify(message);
    this.sessions.forEach(session => {
      try {
        if (session.readyState === WebSocket.OPEN) {
          session.send(messageStr);
        }
      } catch (error) {
        this.sessions.delete(session);
      }
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Handle incoming WebSocket messages if needed
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    this.sessions.delete(ws);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    this.sessions.delete(ws);
  }
}
