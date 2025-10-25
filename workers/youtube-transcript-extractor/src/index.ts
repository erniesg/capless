/**
 * YouTube Transcript Extractor - Cloudflare Container Worker
 *
 * Uses the Container helper class to wrap Python yt-dlp in a container.
 * Provides HTTP endpoints for transcript extraction with auto-retry.
 */

import { Container } from "@cloudflare/containers";
import { env as globalEnv } from "cloudflare:workers";

/**
 * YouTube Transcript Extractor Container
 *
 * Runs Python HTTP server with yt-dlp for transcript extraction.
 * Supports automatic cookie refresh on authentication errors.
 */
export class YouTubeExtractor extends Container {
	// Configure default port for the container
	defaultPort = 8080;

	// Keep container alive for 10 minutes after last request
	sleepAfter = "10m";

	// Pass Worker Secrets to container as environment variables
	envVars = {
		SCRAPE_DO_TOKEN: globalEnv.SCRAPE_DO_TOKEN || "",
		R2_ACCOUNT_ID: globalEnv.R2_ACCOUNT_ID || "",
		R2_ACCESS_KEY_ID: globalEnv.R2_ACCESS_KEY_ID || "",
		R2_SECRET_ACCESS_KEY: globalEnv.R2_SECRET_ACCESS_KEY || "",
		R2_BUCKET_NAME: globalEnv.R2_BUCKET_NAME || "capless-preview",
	};

	// Enable internet access for yt-dlp and R2 uploads
	enableInternet = true;

	// Lifecycle hook: Called when container starts
	override onStart(): void {
		console.log("YouTube Extractor container started successfully");
		console.log(`Scrape.do token present: ${!!this.envVars.SCRAPE_DO_TOKEN}`);
		console.log(`R2 credentials present: ${!!this.envVars.R2_ACCOUNT_ID}`);
	}

	// Lifecycle hook: Called when container shuts down
	override onStop(): void {
		console.log("YouTube Extractor container stopped");
	}

	// Lifecycle hook: Called on errors
	override onError(error: unknown): void {
		console.error("YouTube Extractor container error:", error);
		// Don't throw - let container restart
	}
}

/**
 * Environment bindings
 */
export interface Env {
	YOUTUBE_EXTRACTOR: DurableObjectNamespace<YouTubeExtractor>;
	R2: R2Bucket;
	// Secrets - set via: npx wrangler secret put <NAME>
	SCRAPE_DO_TOKEN?: string;
	R2_ACCOUNT_ID?: string;
	R2_ACCESS_KEY_ID?: string;
	R2_SECRET_ACCESS_KEY?: string;
	R2_BUCKET_NAME?: string;
}

/**
 * Main Worker handler
 *
 * Routes requests to a single Durable Object instance of the container.
 */
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Health check at worker level
		if (url.pathname === "/health") {
			return new Response(
				JSON.stringify({
					status: "healthy",
					service: "youtube-transcript-extractor-worker",
					version: "2.0.0",
					container_class: "Container helper (proper implementation)",
				}),
				{
					headers: { "Content-Type": "application/json" },
				}
			);
		}

		// Get Durable Object instance
		// Using a fixed ID for single-instance deployment
		const id = env.YOUTUBE_EXTRACTOR.idFromName("extractor-v2");
		const stub = env.YOUTUBE_EXTRACTOR.get(id);

		try {
			// Forward request to container
			// The Container class handles all the complexity
			return await stub.fetch(request);
		} catch (error) {
			console.error("Worker error:", error);
			return new Response(
				JSON.stringify({
					status: "error",
					message: "Container unavailable",
					error: error instanceof Error ? error.message : String(error),
					hint: "Container may be starting up (takes 2-3 minutes on first request)",
				}),
				{
					status: 503,
					headers: { "Content-Type": "application/json" },
				}
			);
		}
	},
};
