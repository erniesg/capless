/**
 * Helper for managing Cloudflare Workers during integration tests
 * Starts and stops wrangler dev processes
 */

import { ChildProcess, spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

/**
 * Worker configuration
 */
export interface WorkerConfig {
  name: string;
  directory: string;
  port: number;
  env?: Record<string, string>;
}

/**
 * Worker process manager
 */
export class WorkerManager {
  private processes: Map<string, ChildProcess> = new Map();
  private startupLogs: Map<string, string[]> = new Map();

  /**
   * Start a worker via wrangler dev
   */
  async startWorker(config: WorkerConfig): Promise<void> {
    if (this.processes.has(config.name)) {
      throw new Error(`Worker ${config.name} is already running`);
    }

    console.log(`Starting worker: ${config.name} on port ${config.port}`);

    const childProcess = spawn('npx', ['wrangler', 'dev', '--port', config.port.toString()], {
      cwd: config.directory,
      env: {
        ...process.env,
        ...config.env,
      },
      stdio: 'pipe',
    });

    this.processes.set(config.name, childProcess);
    this.startupLogs.set(config.name, []);

    // Capture logs
    const logs = this.startupLogs.get(config.name)!;
    childProcess.stdout?.on('data', (data) => {
      const line = data.toString();
      logs.push(line);
      if (process.env.DEBUG_WORKERS) {
        console.log(`[${config.name}] ${line}`);
      }
    });

    childProcess.stderr?.on('data', (data) => {
      const line = data.toString();
      logs.push(line);
      if (process.env.DEBUG_WORKERS) {
        console.error(`[${config.name}] ${line}`);
      }
    });

    childProcess.on('error', (error) => {
      console.error(`Worker ${config.name} process error:`, error);
    });

    childProcess.on('exit', (code, signal) => {
      console.log(`Worker ${config.name} exited with code ${code}, signal ${signal}`);
    });

    // Wait for worker to be ready
    await this.waitForWorkerReady(config);
  }

  /**
   * Wait for worker to be ready by checking logs and health
   */
  private async waitForWorkerReady(config: WorkerConfig): Promise<void> {
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 500; // 500ms
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const logs = this.startupLogs.get(config.name) || [];
      const logText = logs.join('\n');

      // Check if wrangler reports the worker is ready
      if (logText.includes('Ready on') || logText.includes(`localhost:${config.port}`)) {
        // Additional health check via HTTP
        try {
          const response = await fetch(`http://localhost:${config.port}/health`, {
            signal: AbortSignal.timeout(2000),
          });

          if (response.ok) {
            console.log(`Worker ${config.name} is ready on port ${config.port}`);
            return;
          }
        } catch {
          // Health endpoint may not exist, that's okay
          // If logs show ready, trust it
          console.log(`Worker ${config.name} ready (logs indicate startup)`);
          return;
        }
      }

      // Check for startup errors
      if (
        logText.includes('Error') ||
        logText.includes('Failed to start') ||
        logText.includes('EADDRINUSE')
      ) {
        throw new Error(
          `Worker ${config.name} failed to start:\n${logText}`
        );
      }

      await sleep(checkInterval);
    }

    throw new Error(
      `Worker ${config.name} did not become ready within ${maxWaitTime}ms\n` +
      `Logs: ${this.startupLogs.get(config.name)?.join('\n')}`
    );
  }

  /**
   * Stop a worker
   */
  async stopWorker(name: string): Promise<void> {
    const childProcess = this.processes.get(name);
    if (!childProcess) {
      console.warn(`Worker ${name} is not running`);
      return;
    }

    console.log(`Stopping worker: ${name}`);

    // Send SIGTERM for graceful shutdown
    childProcess.kill('SIGTERM');

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`Worker ${name} did not exit gracefully, forcing kill`);
        childProcess.kill('SIGKILL');
        resolve();
      }, 5000);

      childProcess.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.processes.delete(name);
    this.startupLogs.delete(name);
  }

  /**
   * Stop all workers
   */
  async stopAll(): Promise<void> {
    const names = Array.from(this.processes.keys());
    await Promise.all(names.map(name => this.stopWorker(name)));
  }

  /**
   * Check if worker is running
   */
  isRunning(name: string): boolean {
    const childProcess = this.processes.get(name);
    return childProcess !== undefined && !childProcess.killed;
  }

  /**
   * Get startup logs for a worker
   */
  getLogs(name: string): string[] {
    return this.startupLogs.get(name) || [];
  }

  /**
   * Make HTTP request to worker
   */
  async request(
    port: number,
    path: string,
    options?: RequestInit
  ): Promise<Response> {
    const url = `http://localhost:${port}${path}`;
    return fetch(url, options);
  }
}

/**
 * Predefined worker configurations
 */
export const WORKER_CONFIGS = {
  ingestion: {
    name: 'capless-ingest',
    directory: '/Users/erniesg/code/erniesg/capless/workers/capless-ingest',
    port: 8787,
  },
  videoMatcher: {
    name: 'video-matcher',
    directory: '/Users/erniesg/code/erniesg/capless/workers/video-matcher',
    port: 8788,
  },
  moments: {
    name: 'moments',
    directory: '/Users/erniesg/code/erniesg/capless/workers/moments',
    port: 8789,
  },
  assetGenerator: {
    name: 'asset-generator',
    directory: '/Users/erniesg/code/erniesg/capless/workers/asset-generator',
    port: 8790,
  },
  videoCompositor: {
    name: 'video-compositor',
    directory: '/Users/erniesg/code/erniesg/capless/workers/video-compositor',
    port: 8791,
  },
};

/**
 * Create a worker manager instance
 */
export function createWorkerManager(): WorkerManager {
  return new WorkerManager();
}
