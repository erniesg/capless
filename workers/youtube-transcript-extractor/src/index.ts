/**
 * YouTube Transcript Extractor - Durable Objects Container Wrapper
 *
 * This Worker wraps the Python yt-dlp container in a Durable Object,
 * providing HTTP endpoints for transcript extraction with auto-retry.
 */

import { Container } from "@cloudflare/containers";

/**
 * YouTube Transcript Extractor Container
 *
 * Runs Python HTTP server with yt-dlp for transcript extraction.
 * Supports automatic cookie refresh on authentication errors.
 */
export class YouTubeExtractor extends Container {
	defaultPort = 8080;
	sleepAfter = "1h"; // Container sleeps after 1 hour of inactivity

	async start(env: Env) {
		return await this.startAndWaitForPorts({
			startOptions: {
				envVars: {
					R2_ACCOUNT_ID: env.R2_ACCOUNT_ID || '',
					R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID || '',
					R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY || '',
					R2_BUCKET_NAME: env.R2_BUCKET_NAME || 'capless-preview',
				},
			},
		});
	}
}

/**
 * Environment bindings
 */
export interface Env {
	YOUTUBE_EXTRACTOR: DurableObjectNamespace<YouTubeExtractor>;
	R2: R2Bucket;
	// R2 secrets - set via: npx wrangler secret put R2_ACCOUNT_ID
	R2_ACCOUNT_ID?: string;
	R2_ACCESS_KEY_ID?: string;
	R2_SECRET_ACCESS_KEY?: string;
	R2_BUCKET_NAME?: string;
}

/**
 * Main Worker handler
 *
 * Routes requests to a single Durable Object instance of the container.
 * For production with multiple instances, use getRandom() pattern.
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
					version: "1.0.0",
				}),
				{
					headers: { "Content-Type": "application/json" },
				}
			);
		}

		// Get or create Durable Object instance
		// Using a fixed ID for single-instance deployment
		const id = env.YOUTUBE_EXTRACTOR.idFromName("extractor-v1");
		const stub = env.YOUTUBE_EXTRACTOR.get(id);

		// Forward request to container
		try {
			return await stub.fetch(request);
		} catch (error) {
			console.error("Container error:", error);
			return new Response(
				JSON.stringify({
					status: "error",
					message: "Container unavailable",
					error: error instanceof Error ? error.message : String(error),
				}),
				{
					status: 503,
					headers: { "Content-Type": "application/json" },
				}
			);
		}
	},
};
