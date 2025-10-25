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
		// Only pass env vars that are actually set (no empty string fallbacks)
		const envVars: Record<string, string> = {};

		if (env.SCRAPE_DO_TOKEN) envVars.SCRAPE_DO_TOKEN = env.SCRAPE_DO_TOKEN;
		if (env.R2_ACCOUNT_ID) envVars.R2_ACCOUNT_ID = env.R2_ACCOUNT_ID;
		if (env.R2_ACCESS_KEY_ID) envVars.R2_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID;
		if (env.R2_SECRET_ACCESS_KEY) envVars.R2_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY;

		// R2_BUCKET_NAME has a default
		envVars.R2_BUCKET_NAME = env.R2_BUCKET_NAME || 'capless-preview';

		return await this.startAndWaitForPorts({
			startOptions: {
				envVars,
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
	// scrape.do proxy token - set via: npx wrangler secret put SCRAPE_DO_TOKEN
	SCRAPE_DO_TOKEN?: string;
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

		// Handle /extract endpoint directly in worker to upload to R2
		if (url.pathname === "/extract" && request.method === "POST") {
			try {
				const body = await request.json() as { video_id: string; date: string };
				const { video_id, date } = body;

				if (!video_id || !date) {
					return new Response(JSON.stringify({ status: "error", message: "Missing video_id or date" }), {
						status: 400,
						headers: { "Content-Type": "application/json" },
					});
				}

				// Get container instance
				const id = env.YOUTUBE_EXTRACTOR.idFromName("extractor-v1");
				const stub = env.YOUTUBE_EXTRACTOR.get(id);

				// Create new request for container (original body was consumed)
				const containerRequest = new Request(`http://container/extract`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ video_id, date }),
				});

				// Forward to container to extract transcript
				const containerResponse = await stub.fetch(containerRequest);
				const result = await containerResponse.json() as {
					status: string;
					video_id: string;
					date: string;
					transcript: string;
					message?: string;
				};

				if (result.status !== "success" || !result.transcript) {
					return new Response(JSON.stringify(result), {
						status: containerResponse.status,
						headers: { "Content-Type": "application/json" },
					});
				}

				// Upload transcript to R2 using binding
				const r2Key = `youtube/transcripts/${date}.vtt`;
				await env.R2.put(r2Key, result.transcript, {
					httpMetadata: { contentType: "text/vtt" },
				});

				console.log(`✅ Uploaded transcript to R2: ${r2Key} (${result.transcript.length} bytes)`);

				return new Response(JSON.stringify({
					status: "success",
					video_id,
					date,
					transcript_length: result.transcript.length,
					transcript_path: r2Key,
					uploaded_to_r2: true,
				}), {
					headers: { "Content-Type": "application/json" },
				});
			} catch (error) {
				console.error("Extract endpoint error:", error);
				return new Response(
					JSON.stringify({
						status: "error",
						message: error instanceof Error ? error.message : String(error),
					}),
					{
						status: 500,
						headers: { "Content-Type": "application/json" },
					}
				);
			}
		}

		// Forward other requests to container
		const id = env.YOUTUBE_EXTRACTOR.idFromName("extractor-v1");
		const stub = env.YOUTUBE_EXTRACTOR.get(id);

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
